(function () {
    'use strict';

    if (window.__jfUserRatingLoaded) {
        return;
    }
    window.__jfUserRatingLoaded = true;

    var FLAG = 'jf-userrating-sort';
    var BADGE_KEY = 'jf-userrating-badges';
    var OPTION_VALUE = 'UserRating';
    var ratings = {};
    var fullCache = { key: '', items: null, inflight: null };

    function t(key) {
        return (window.UserRatingI18n && window.UserRatingI18n.t)
            ? window.UserRatingI18n.t(key)
            : key;
    }

    function badgesAlwaysOn() {
        var v = null;
        try {
            v = localStorage.getItem(BADGE_KEY);
        } catch (e) { /* private mode */ }
        if (v === '1') {
            return true;
        }
        if (v === '0') {
            return false;
        }
        return sessionStorage.getItem(FLAG) === '1';
    }

    function applyBadgeMode() {
        var on = badgesAlwaysOn();
        document.documentElement.classList.toggle('ur-badges-always', on);
        document.querySelectorAll('.ur-badge-toggle').forEach(function (btn) {
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.classList.toggle('ur-badge-toggle-on', on);
        });
    }

    function toggleBadgesAlways() {
        try {
            localStorage.setItem(BADGE_KEY, badgesAlwaysOn() ? '0' : '1');
        } catch (e) { /* private mode */ }
        applyBadgeMode();
    }

    function userRating(item) {
        var n = item && item.UserData && item.UserData.Rating;
        return n == null || n === '' ? null : Number(n);
    }

    function remember(items) {
        if (!items) {
            return;
        }
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it && it.Id) {
                ratings[it.Id] = userRating(it);
            }
        }
    }

    function isItemsListUrl(url) {
        if (!url || url.indexOf('/Items') === -1) {
            return false;
        }
        if (/\/Items\/[0-9a-fA-F-]{8,}/.test(url)) {
            return false;
        }
        return url.indexOf('/Items/Resume') === -1
            && url.indexOf('/Items/Counts') === -1
            && url.indexOf('/Items/Filters') === -1;
    }

    function parseUrl(url) {
        try {
            return new URL(url, window.location.origin);
        } catch (e) {
            return null;
        }
    }

    function wantsUserSort(u) {
        var sortBy = (u.searchParams.get('SortBy') || '');
        if (sortBy.split(',').indexOf(OPTION_VALUE) !== -1) {
            return true;
        }
        return sessionStorage.getItem(FLAG) === '1';
    }

    function sortItems(items, descending) {
        var copy = items.slice();
        copy.sort(function (a, b) {
            var ra = userRating(a);
            var rb = userRating(b);
            var aN = ra == null;
            var bN = rb == null;
            if (aN && bN) {
                return String(a.SortName || a.Name || '').localeCompare(String(b.SortName || b.Name || ''));
            }
            if (aN) {
                return 1;
            }
            if (bN) {
                return -1;
            }
            if (ra !== rb) {
                return descending ? rb - ra : ra - rb;
            }
            return String(a.SortName || a.Name || '').localeCompare(String(b.SortName || b.Name || ''));
        });
        return copy;
    }

    function cacheKey(u) {
        return [
            u.searchParams.get('ParentId') || '',
            u.searchParams.get('IncludeItemTypes') || '',
            u.searchParams.get('Recursive') || '',
            u.searchParams.get('Filters') || '',
            u.searchParams.get('Genres') || '',
            u.searchParams.get('Years') || ''
        ].join('|');
    }

    async function fetchAll(origFetch, input, init, u) {
        var key = cacheKey(u);
        if (fullCache.key === key && fullCache.items) {
            return fullCache.items;
        }
        if (fullCache.key === key && fullCache.inflight) {
            return fullCache.inflight;
        }

        var allUrl = new URL(u.toString());
        allUrl.searchParams.set('StartIndex', '0');
        allUrl.searchParams.set('Limit', '20000');
        allUrl.searchParams.delete('SortBy');
        allUrl.searchParams.delete('SortOrder');
        allUrl.searchParams.delete('NameStartsWith');
        allUrl.searchParams.delete('NameLessThan');
        var fields = allUrl.searchParams.get('Fields') || '';
        if (fields.indexOf('BasicSyncInfo') === -1 && fields) {
            allUrl.searchParams.set('Fields', fields);
        }

        fullCache.key = key;
        fullCache.inflight = origFetch(allUrl.toString(), init).then(function (res) {
            return res.json().then(function (data) {
                var items = (data && data.Items) || [];
                remember(items);
                fullCache.items = items;
                fullCache.inflight = null;
                return items;
            });
        }).catch(function (err) {
            fullCache.inflight = null;
            fullCache.key = '';
            throw err;
        });
        return fullCache.inflight;
    }

    function jsonResponse(obj, status) {
        return new Response(JSON.stringify(obj), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function installFetchHook() {
        var origFetch = window.fetch.bind(window);
        window.fetch = async function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var u = parseUrl(url);
            if (!u || !isItemsListUrl(u.pathname + u.search)) {
                return origFetch(input, init);
            }

            if (!wantsUserSort(u)) {
                var res2 = await origFetch(input, init);
                try {
                    harvestResponse(res2.clone(), url);
                } catch (e) { /* ignore clone failures */ }
                return res2;
            }

            try {
                var descending = (u.searchParams.get('SortOrder') || 'Ascending') === 'Descending';
                var start = parseInt(u.searchParams.get('StartIndex') || '0', 10) || 0;
                var limit = parseInt(u.searchParams.get('Limit') || '100', 10) || 100;
                var all = await fetchAll(origFetch, input, init, u);
                var sorted = sortItems(all, descending);
                var page = sorted.slice(start, start + limit);
                remember(page);
                scheduleDecorate();
                return jsonResponse({
                    Items: page,
                    TotalRecordCount: sorted.length,
                    StartIndex: start
                });
            } catch (e) {
                return origFetch(input, init);
            }
        };
    }

    function harvestResponse(res, url) {
        if (!res || !res.ok) {
            return;
        }
        res.json().then(function (data) {
            if (data && data.Items) {
                remember(data.Items);
            } else if (data && data.Id && data.UserData) {
                ratings[data.Id] = userRating(data);
            }
            scheduleDecorate();
        }).catch(function () { /* ignore non-json */ });
    }

    function starHtml(value, interactive, itemId) {
        var n = value == null ? 0 : Number(value);
        var label = value == null ? '–' : String(n);
        var html = '<span class="ur-stars' + (interactive ? ' ur-stars-edit' : '') + '" data-urid="' + (itemId || '') + '" title="' + t('badgeTitle') + '">';
        html += '<span class="material-icons starIcon star ur-icon" aria-hidden="true"></span>';
        html += '<span class="ur-value">' + label + '</span>';
        html += '</span>';
        return html;
    }

    function closePicker() {
        var menu = document.getElementById('ur-picker-menu');
        if (menu) {
            menu.remove();
        }
        document.querySelectorAll('.ur-stars-edit.ur-editing').forEach(function (el) {
            el.classList.remove('ur-editing');
        });
    }

    function openPicker(stars) {
        closePicker();
        var itemId = stars.getAttribute('data-urid');
        if (!itemId) {
            return;
        }
        stars.classList.add('ur-editing');
        var current = ratings[itemId];
        var rect = stars.getBoundingClientRect();
        var menu = document.createElement('div');
        menu.id = 'ur-picker-menu';
        menu.className = 'ur-picker-menu';
        for (var i = 10; i >= 1; i--) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ur-pick';
            btn.setAttribute('data-rating', String(i));
            btn.setAttribute('data-urid', itemId);
            if (Number(current) === i) {
                btn.setAttribute('data-current', '1');
            }
            btn.textContent = String(i);
            menu.appendChild(btn);
        }
        menu.style.left = Math.max(8, Math.round(rect.left)) + 'px';
        menu.style.top = Math.round(rect.bottom + 4) + 'px';
        document.body.appendChild(menu);
    }

    function badgeHost(card) {
        return card.querySelector('.cardScalable')
            || card.querySelector('.cardBox')
            || card.querySelector('.cardOverlayContainer')
            || card.querySelector('.cardImageContainer');
    }

    function decorateCard(card) {
        var id = card.getAttribute('data-id');
        if (!id) {
            return;
        }
        var val = ratings[id];
        var host = badgeHost(card);
        if (!host) {
            return;
        }
        var badge = card.querySelector('.ur-overlay-badge');
        if (val == null) {
            if (badge) {
                badge.remove();
            }
            return;
        }
        var html = starHtml(val, false, id);
        if (badge && badge.parentNode === host) {
            if (badge.innerHTML !== html) {
                badge.innerHTML = html;
            }
            return;
        }
        if (badge) {
            badge.remove();
        }
        badge = document.createElement('div');
        badge.className = 'ur-overlay-badge';
        badge.innerHTML = html;
        host.appendChild(badge);
    }

    function decorateDetails() {
        var misc = document.querySelector('.itemMiscInfo-primary');
        if (!misc) {
            return;
        }
        var itemId = getDetailItemId();
        if (!itemId) {
            return;
        }
        var existing = misc.querySelector('.ur-detail');
        var val = ratings[itemId];
        if (existing) {
            if (existing.contains(document.activeElement) || existing.querySelector('.ur-editing')) {
                return;
            }
            var next = starHtml(val, true, itemId);
            if (existing.innerHTML !== next) {
                existing.innerHTML = next;
            }
            return;
        }
        var comm = misc.querySelector('.starRatingContainer');
        var node = document.createElement('div');
        node.className = 'starRatingContainer mediaInfoItem ur-detail';
        node.innerHTML = starHtml(val, true, itemId);
        if (comm && comm.parentNode) {
            comm.parentNode.insertBefore(node, comm.nextSibling);
        } else {
            misc.appendChild(node);
        }
        ensureDetailRatingLoaded(itemId);
    }

    function getDetailItemId() {
        var card = document.querySelector('.itemDetailPage [data-id], .itemDetailPage .itemAction[data-id]');
        if (card && card.getAttribute('data-id')) {
            return card.getAttribute('data-id');
        }
        var hash = window.location.hash || window.location.href;
        var m = hash.match(/id=([0-9a-fA-F-]{8,})/i);
        return m ? m[1] : null;
    }

    function ensureDetailRatingLoaded(itemId) {
        if (ratings[itemId] != null || !window.ApiClient) {
            return;
        }
        var userId = window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId();
        if (!userId) {
            return;
        }
        window.ApiClient.getItem(userId, itemId).then(function (item) {
            remember([item]);
            scheduleDecorate();
        }).catch(function () { /* ignore */ });
    }

    var decorating = false;
    function decorateAll() {
        if (decorating) {
            return;
        }
        decorating = true;
        try {
            document.querySelectorAll('.card[data-id], .card-hoverable[data-id]').forEach(decorateCard);
            decorateDetails();
            injectSortOptions();
            injectBadgeToggles();
            applyBadgeMode();
        } finally {
            decorating = false;
        }
    }

    var decorateQueued = false;
    function scheduleDecorate() {
        if (decorateQueued) {
            return;
        }
        decorateQueued = true;
        requestAnimationFrame(function () {
            decorateQueued = false;
            decorateAll();
        });
    }

    function injectClassicSelect() {
        document.querySelectorAll('select.selectSortBy').forEach(function (sel) {
            if (sel.querySelector('option[value="' + OPTION_VALUE + '"], option[value^="UserRating"]')) {
                return;
            }
            var opt = document.createElement('option');
            opt.value = 'UserRating,SortName,ProductionYear';
            opt.textContent = t('sort');
            var comm = Array.prototype.find.call(sel.options, function (o) {
                return String(o.value).indexOf('CommunityRating') === 0;
            });
            if (comm) {
                sel.insertBefore(opt, comm.nextSibling);
            } else {
                sel.appendChild(opt);
            }
            sel.addEventListener('change', function () {
                if (String(sel.value).indexOf('UserRating') === 0) {
                    sessionStorage.setItem(FLAG, '1');
                } else {
                    sessionStorage.removeItem(FLAG);
                }
                applyBadgeMode();
            });
        });
    }

    function isCommunitySortControl(el) {
        var v = (el.getAttribute('data-id') || el.getAttribute('data-value') || el.value || '') + ' ' + (el.textContent || '');
        return /CommunityRating|Community-Bewertung|Community Rating/i.test(v);
    }

    function injectClassicRadioMenu() {
        var radios = document.querySelectorAll('input.menuSortBy');
        if (!radios.length) {
            return;
        }
        var host = radios[0].closest('div') || radios[0].parentNode;
        if (!host) {
            return;
        }
        var existing = host.querySelector('.ur-sort-radio');
        if (existing) {
            if (sessionStorage.getItem(FLAG) === '1') {
                var ours = existing.querySelector('input');
                if (ours) {
                    ours.checked = true;
                }
            }
            return;
        }

        var commLabel = null;
        for (var i = 0; i < radios.length; i++) {
            if (isCommunitySortControl(radios[i])) {
                commLabel = radios[i].closest('label') || radios[i].parentNode;
                break;
            }
        }

        var label = document.createElement('label');
        label.className = 'radio-label-block ur-sort-radio';
        label.innerHTML = '<input type="radio" is="emby-radio" name="SortBy" data-id="UserRating,SortName,ProductionYear" value="UserRating_SortName,ProductionYear" class="menuSortBy" /><span>' + t('sort') + '</span>';
        var input = label.querySelector('input');
        if (sessionStorage.getItem(FLAG) === '1') {
            input.checked = true;
        }
        input.addEventListener('change', function () {
            if (!input.checked) {
                return;
            }
            sessionStorage.setItem(FLAG, '1');
            applyBadgeMode();
            refreshLibrary();
        });

        if (commLabel && commLabel.parentNode) {
            commLabel.parentNode.insertBefore(label, commLabel.nextSibling);
        } else {
            host.appendChild(label);
        }
    }

    function injectMuiSortListbox() {
        document.querySelectorAll('ul[role="listbox"]').forEach(function (ul) {
            if (ul.querySelector('.ur-sort-menuitem')) {
                return;
            }
            var items = ul.querySelectorAll('li[role="option"]');
            var comm = null;
            for (var i = 0; i < items.length; i++) {
                if (isCommunitySortControl(items[i])) {
                    comm = items[i];
                    break;
                }
            }
            if (!comm) {
                return;
            }
            var li = comm.cloneNode(true);
            li.classList.add('ur-sort-menuitem');
            li.setAttribute('data-value', OPTION_VALUE);
            li.setAttribute('aria-selected', sessionStorage.getItem(FLAG) === '1' ? 'true' : 'false');
            li.textContent = t('sort');
            li.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                sessionStorage.setItem(FLAG, '1');
                applyBadgeMode();
                refreshLibrary();
                document.body.click();
            });
            comm.parentNode.insertBefore(li, comm.nextSibling);
        });
    }

    function refreshLibrary() {
        var nodes = document.querySelectorAll('.itemsContainer');
        var any = false;
        for (var i = 0; i < nodes.length; i++) {
            if (typeof nodes[i].refreshItems === 'function') {
                nodes[i].refreshItems();
                any = true;
            }
        }
        if (!any) {
            window.location.reload();
        }
    }

    function injectExperimentalPopover() {
        var pop = document.getElementById('sort-popover');
        if (!pop || pop.querySelector('.ur-sort-option')) {
            if (pop) {
                var btn = pop.querySelector('.ur-sort-option');
                if (btn) {
                    btn.setAttribute('data-active', sessionStorage.getItem(FLAG) === '1' ? '1' : '0');
                }
            }
            return;
        }
        var controls = pop.querySelectorAll('.MuiFormControl-root');
        if (!controls.length) {
            return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'ur-sort-wrap MuiFormControl-root';
        wrap.innerHTML = '<button type="button" class="ur-sort-option">' + t('sort') + '</button>';
        var btn = wrap.querySelector('.ur-sort-option');
        btn.setAttribute('data-active', sessionStorage.getItem(FLAG) === '1' ? '1' : '0');
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            sessionStorage.setItem(FLAG, '1');
            applyBadgeMode();
            btn.setAttribute('data-active', '1');
            fullCache = { key: '', items: null, inflight: null };
            triggerLibraryRefresh();
        });
        controls[0].parentNode.insertBefore(wrap, controls[0].nextSibling);

        pop.addEventListener('click', function (ev) {
            var li = ev.target.closest('li[role="option"]');
            if (!li) {
                return;
            }
            sessionStorage.removeItem(FLAG);
            applyBadgeMode();
            var b = pop.querySelector('.ur-sort-option');
            if (b) {
                b.setAttribute('data-active', '0');
            }
        });
    }

    function triggerLibraryRefresh() {
        var order = document.getElementById('selectSortOrder');
        if (order) {
            var current = order.value || order.getAttribute('value') || 'Descending';
            var next = current === 'Descending' ? 'Ascending' : 'Descending';
            // Toggle sort order to force React to refetch, then toggle back via a second click if needed.
            clickMuiOption(order, next);
            setTimeout(function () {
                clickMuiOption(order, current);
            }, 200);
            return;
        }
        window.location.reload();
    }

    function clickMuiOption(selectEl, value) {
        try {
            selectEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            selectEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            setTimeout(function () {
                var items = document.querySelectorAll('li[role="option"]');
                for (var i = 0; i < items.length; i++) {
                    var v = items[i].getAttribute('data-value') || items[i].textContent.trim();
                    if (v === value || (value === 'Descending' && /Absteigend|Descending/i.test(v))
                        || (value === 'Ascending' && /Aufsteigend|Ascending/i.test(v))) {
                        items[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        return;
                    }
                }
                window.location.reload();
            }, 50);
        } catch (e) {
            window.location.reload();
        }
    }

    function injectSortOptions() {
        injectClassicSelect();
        injectClassicRadioMenu();
        injectMuiSortListbox();
        injectExperimentalPopover();
    }

    function makeBadgeToggle(mui) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = mui
            ? 'ur-badge-toggle MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-colorInherit'
            : 'ur-badge-toggle autoSize paper-icon-button-light';
        var tip = t('toggleAlways');
        btn.setAttribute('title', tip);
        btn.setAttribute('aria-label', tip);
        btn.setAttribute('aria-pressed', badgesAlwaysOn() ? 'true' : 'false');
        if (badgesAlwaysOn()) {
            btn.classList.add('ur-badge-toggle-on');
        }
        btn.innerHTML = '<span class="material-icons star" aria-hidden="true"></span>';
        return btn;
    }

    function toolbarHasToggle(parent) {
        return !!(parent && parent.querySelector('.ur-badge-toggle'));
    }

    function injectNextTo(anchor) {
        if (!anchor || !anchor.parentNode) {
            return;
        }
        var parent = anchor.parentNode;
        if (toolbarHasToggle(parent)) {
            return;
        }
        parent.insertBefore(makeBadgeToggle(false), anchor.nextSibling);
    }

    function injectBadgeToggles() {
        document.querySelectorAll('.btnSort').forEach(function (btn) {
            injectNextTo(btn);
        });
        document.querySelectorAll('.btnSelectView').forEach(function (btn) {
            var parent = btn.parentNode;
            if (!parent || parent.querySelector('.btnSort') || toolbarHasToggle(parent)) {
                return;
            }
            injectNextTo(btn);
        });
        document.querySelectorAll('.MuiButtonGroup-root').forEach(function (group) {
            if (toolbarHasToggle(group.parentNode) || group.querySelector('.ur-badge-toggle')) {
                return;
            }
            var isLib = false;
            var buttons = group.querySelectorAll('button');
            for (var i = 0; i < buttons.length; i++) {
                var t = (buttons[i].getAttribute('title') || '') + ' ' + (buttons[i].getAttribute('aria-label') || '');
                if (/Sort|Filter|Sortieren|Filtern/i.test(t)) {
                    isLib = true;
                    break;
                }
            }
            if (!isLib) {
                return;
            }
            if (group.parentNode) {
                group.parentNode.insertBefore(makeBadgeToggle(true), group.nextSibling);
            }
        });
    }

    function postRating(itemId, rating) {
        if (!window.ApiClient) {
            return Promise.reject(new Error('no ApiClient'));
        }
        var userId = window.ApiClient.getCurrentUserId();
        var url = window.ApiClient.getUrl('Users/' + userId + '/Items/' + itemId + '/UserData');
        return window.ApiClient.ajax({
            type: 'POST',
            url: url,
            data: JSON.stringify({ Rating: rating }),
            contentType: 'application/json',
            dataType: 'json'
        }).then(function (data) {
            ratings[itemId] = rating;
            fullCache = { key: '', items: null, inflight: null };
            closePicker();
            document.querySelectorAll('.ur-stars[data-urid="' + itemId + '"] .ur-value').forEach(function (el) {
                el.textContent = String(rating);
            });
            document.querySelectorAll('.ur-stars-edit[data-urid="' + itemId + '"]').forEach(function (el) {
                el.classList.remove('ur-editing');
                var sel = el.querySelector('.ur-select');
                if (sel) {
                    sel.value = String(rating);
                }
            });
            decorateAll();
            return data;
        });
    }

    document.addEventListener('click', function (ev) {
        var tog = ev.target.closest && ev.target.closest('.ur-badge-toggle');
        if (tog) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleBadgesAlways();
            return;
        }
        var pick = ev.target.closest && ev.target.closest('.ur-pick');
        if (pick) {
            ev.preventDefault();
            ev.stopPropagation();
            var itemId = pick.getAttribute('data-urid');
            var rating = Number(pick.getAttribute('data-rating'));
            closePicker();
            if (itemId && rating) {
                postRating(itemId, rating);
            }
            return;
        }
        var stars = ev.target.closest && ev.target.closest('.ur-stars-edit');
        if (stars) {
            ev.preventDefault();
            ev.stopPropagation();
            if (stars.classList.contains('ur-editing')) {
                closePicker();
            } else {
                openPicker(stars);
            }
            return;
        }
        if (!ev.target.closest || !ev.target.closest('#ur-picker-menu')) {
            closePicker();
        }
    }, true);

    document.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t) {
            return;
        }
        if (t.classList && t.classList.contains('menuSortBy') && !t.closest('.ur-sort-radio')) {
            if ((t.getAttribute('data-id') || '').indexOf('UserRating') !== 0) {
                sessionStorage.removeItem(FLAG);
                applyBadgeMode();
            }
        }
    }, true);

    function injectCss() {
        if (document.getElementById('ur-style')) {
            return;
        }
        var css = document.createElement('style');
        css.id = 'ur-style';
        css.textContent = [
            '.itemMiscInfo-primary{overflow:visible!important;}',
            '.ur-overlay-badge{position:absolute;top:8px;left:8px;z-index:4;background:rgba(0,0,0,.72);color:#fff;border-radius:4px;padding:2px 6px;font-size:12px;pointer-events:none;opacity:0;transition:opacity .2s;}',
            '.card:hover .ur-overlay-badge,.card:focus-within .ur-overlay-badge,html.ur-badges-always .ur-overlay-badge{opacity:1;}',
            '.ur-badge-toggle{min-width:40px;color:inherit;}',
            '.ur-badge-toggle .material-icons{font-size:1.5rem;}',
            '.ur-badge-toggle-on,.ur-badge-toggle[aria-pressed="true"] .material-icons{color:#7cb7ff;}',
            '.ur-detail{display:inline-flex;align-items:center;gap:6px;overflow:visible;}',
            '.ur-icon{font-size:1.2em;margin-right:2px;color:#7cb7ff;}',
            '.ur-value{font-weight:600;}',
            '.ur-stars-edit{position:relative;cursor:pointer;}',
            '.ur-stars-edit.ur-editing{outline:1px solid #7cb7ff;border-radius:4px;}',
            '.ur-picker-menu{position:fixed;z-index:10000;display:flex;flex-direction:column;background:#1c1c1c;border:1px solid rgba(255,255,255,.28);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:70vh;overflow:auto;}',
            '.ur-pick{min-width:44px;height:28px;border:0;background:transparent;color:#ddd;cursor:pointer;border-radius:4px;font:inherit;font-weight:600;}',
            '.ur-pick[data-current="1"],.ur-pick:hover{background:#3e8ef7;color:#fff;}',
            '.ur-sort-wrap{margin:8px;width:200px;}',
            '.ur-sort-option{width:100%;text-align:left;padding:10px 12px;border:1px solid rgba(255,255,255,.23);border-radius:4px;background:transparent;color:inherit;cursor:pointer;}',
            '.ur-sort-option[data-active="1"]{border-color:#3e8ef7;color:#7cb7ff;}'
        ].join('');
        document.head.appendChild(css);
    }

    injectCss();
    installFetchHook();
    applyBadgeMode();

    window.addEventListener('hashchange', function () {
        closePicker();
        scheduleDecorate();
    });
    window.addEventListener('popstate', function () {
        closePicker();
        scheduleDecorate();
    });

    var obs = new MutationObserver(function () {
        scheduleDecorate();
    });
    if (document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    scheduleDecorate();
})();
