(function () {
    'use strict';

    if (window.__jfUserRatingLoaded) {
        return;
    }
    window.__jfUserRatingLoaded = true;

    var FLAG = 'jf-userrating-sort';
    var FLAG_DIR = 'jf-userrating-sort-dir';
    var BADGE_KEY = 'jf-userrating-badges';
    var OPTION_VALUE = 'UserRating';
    var ratings = {};
    var fullCache = { key: '', items: null, inflight: null };

    function isUserSortOn() {
        return sessionStorage.getItem(FLAG) === '1';
    }

    function userSortDescending() {
        return sessionStorage.getItem(FLAG_DIR) !== 'asc';
    }

    function clearUserSort() {
        sessionStorage.removeItem(FLAG);
        sessionStorage.removeItem(FLAG_DIR);
    }

    function setUserSortDir(descending) {
        sessionStorage.setItem(FLAG, '1');
        sessionStorage.setItem(FLAG_DIR, descending ? 'desc' : 'asc');
    }

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
        var data = item && (item.UserData || item.userData);
        var n = data && (data.Rating != null ? data.Rating : data.rating);
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

    function qs(u, name) {
        return u.searchParams.get(name)
            || u.searchParams.get(name.charAt(0).toLowerCase() + name.slice(1))
            || '';
    }

    function wantsUserSort(u) {
        var sortBy = qs(u, 'SortBy');
        if (sortBy.split(',').indexOf(OPTION_VALUE) !== -1) {
            return true;
        }
        return sessionStorage.getItem(FLAG) === '1';
    }

    function wantsDescending(u) {
        var order = qs(u, 'SortOrder');
        var sortBy = qs(u, 'SortBy');
        if (sortBy.split(',').indexOf(OPTION_VALUE) !== -1) {
            return order !== 'Ascending';
        }
        if (isUserSortOn()) {
            return userSortDescending();
        }
        return order === 'Descending';
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
        allUrl.searchParams.set('startIndex', '0');
        allUrl.searchParams.set('Limit', '20000');
        allUrl.searchParams.set('limit', '20000');
        allUrl.searchParams.delete('SortBy');
        allUrl.searchParams.delete('sortBy');
        allUrl.searchParams.delete('SortOrder');
        allUrl.searchParams.delete('sortOrder');
        allUrl.searchParams.delete('NameStartsWith');
        allUrl.searchParams.delete('NameLessThan');
        var fields = qs(allUrl, 'Fields');
        if (!/UserData/i.test(fields)) {
            allUrl.searchParams.append('fields', 'UserData');
            allUrl.searchParams.append('Fields', 'UserData');
        }

        fullCache.key = key;
        var init2 = fetchInit(input, init);
        fullCache.inflight = origFetch(allUrl.toString(), init2).then(function (res) {
            return res.json().then(function (data) {
                var items = (data && (data.Items || data.items)) || [];
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

    function fetchInit(input, init) {
        var out = init ? Object.assign({}, init) : {};
        if (out.headers) {
            return out;
        }
        if (input && typeof input !== 'string' && input.headers) {
            try {
                var headers = {};
                if (typeof input.headers.forEach === 'function') {
                    input.headers.forEach(function (v, k) {
                        headers[k] = v;
                    });
                    out.headers = headers;
                }
                if (input.credentials && !out.credentials) {
                    out.credentials = input.credentials;
                }
            } catch (e) { /* ignore */ }
        }
        return out;
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
                var descending = wantsDescending(u);
                var start = parseInt(qs(u, 'StartIndex') || '0', 10) || 0;
                var limit = parseInt(qs(u, 'Limit') || '100', 10) || 100;
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
            harvestPayload(data);
        }).catch(function () { /* ignore non-json */ });
    }

    function harvestPayload(data) {
        if (!data) {
            return;
        }
        if (data.Items) {
            remember(data.Items);
        } else if (data.items) {
            remember(data.items);
        } else if (data.Id && (data.UserData || data.userData)) {
            ratings[data.Id] = userRating(data);
        }
        scheduleDecorate();
    }

    function installAjaxHook() {
        if (!window.ApiClient || typeof window.ApiClient.ajax !== 'function' || window.ApiClient.__urHooked) {
            return;
        }
        window.ApiClient.__urHooked = true;
        var orig = window.ApiClient.ajax.bind(window.ApiClient);
        window.ApiClient.ajax = function (request) {
            var p = orig(request);
            try {
                var url = (request && request.url) || '';
                if (isItemsListUrl(url) && p && typeof p.then === 'function') {
                    p.then(function (data) {
                        harvestPayload(data);
                    }).catch(function () { /* ignore */ });
                }
            } catch (e) { /* ignore */ }
            return p;
        };
    }

    var primed = false;
    function maybePrimeRatings() {
        if (primed || !window.ApiClient || typeof window.ApiClient.getItems !== 'function') {
            return;
        }
        if (!document.querySelector('.card[data-id]')) {
            return;
        }
        if (Object.keys(ratings).length) {
            primed = true;
            return;
        }
        var userId = window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId();
        if (!userId) {
            return;
        }
        primed = true;
        var parent = '';
        var hash = window.location.hash || '';
        var m = hash.match(/topParentId=([0-9a-fA-F]{8,})/i) || hash.match(/parentId=([0-9a-fA-F]{8,})/i);
        if (m) {
            parent = m[1];
        }
        var opts = { Recursive: true, Fields: 'UserData', Limit: 500 };
        if (parent) {
            opts.ParentId = parent;
        }
        window.ApiClient.getItems(userId, opts).then(function (data) {
            harvestPayload(data);
        }).catch(function () {
            primed = false;
        });
    }

    function ratingCmp(idA, idB, descending) {
        var ra = ratings[idA];
        var rb = ratings[idB];
        var aN = ra == null;
        var bN = rb == null;
        if (aN && bN) {
            return 0;
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
        return 0;
    }

    // JF12 experimental web has .itemsContainer but no refreshItems. The first
    // /Items fetch also often wins the race against this script, so reorder the
    // cards we already painted when the personal-rating flag is on.
    function sortVisibleCards(descending) {
        if (sessionStorage.getItem(FLAG) !== '1') {
            return;
        }
        if (descending == null) {
            descending = userSortDescending();
        }
        var container = document.querySelector('.itemsContainer');
        if (!container) {
            return;
        }
        var cards = container.querySelectorAll('.card[data-id]');
        if (cards.length < 2) {
            return;
        }
        var units = [];
        var seen = {};
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var id = card.getAttribute('data-id');
            if (!id || seen[id]) {
                continue;
            }
            seen[id] = true;
            var node = card;
            while (node.parentNode && node.parentNode !== container) {
                node = node.parentNode;
            }
            units.push({ node: node, id: id });
        }
        if (units.length < 2) {
            return;
        }
        var j;
        for (j = 1; j < units.length; j++) {
            if (ratingCmp(units[j - 1].id, units[j].id, descending) > 0) {
                break;
            }
        }
        if (j === units.length) {
            return;
        }
        units.sort(function (a, b) {
            return ratingCmp(a.id, b.id, descending);
        });
        for (j = 0; j < units.length; j++) {
            container.appendChild(units[j].node);
        }
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
            installAjaxHook();
            maybePrimeRatings();
            document.querySelectorAll('.card[data-id], .card-hoverable[data-id]').forEach(decorateCard);
            decorateDetails();
            injectSortOptions();
            injectBadgeToggles();
            applyBadgeMode();
            sortVisibleCards();
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
                    setUserSortDir(true);
                } else {
                    clearUserSort();
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
            setUserSortDir(true);
            applyBadgeMode();
            refreshLibrary();
        });

        if (commLabel && commLabel.parentNode) {
            commLabel.parentNode.insertBefore(label, commLabel.nextSibling);
        } else {
            host.appendChild(label);
        }
    }

    function relabelMenuItem(li, label) {
        var text = li.querySelector('.MuiListItemText-primary, .MuiTypography-root');
        if (text) {
            text.textContent = label;
            return;
        }
        var walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.trim()) {
                node.nodeValue = label;
                return;
            }
        }
    }

    function arrowPath(descending) {
        return descending
            ? 'm20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z'
            : 'm4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z';
    }

    function nativeSortItems(menu) {
        return menu.querySelectorAll('[role="menuitem"], [role="option"]');
    }

    function ensureSortArrow(li, menu, descending) {
        var icon = li.querySelector('.MuiListItemIcon-root');
        if (!icon) {
            var donor = menu.querySelector('[role="menuitem"] .MuiListItemIcon-root, [role="option"] .MuiListItemIcon-root');
            icon = donor ? donor.cloneNode(false) : document.createElement('div');
            icon.classList.add('ur-sort-arrow-slot');
            if (!donor) {
                icon.className = 'MuiListItemIcon-root ur-sort-arrow-slot';
            }
            li.appendChild(icon);
        }
        var svg = icon.querySelector('svg');
        if (!svg) {
            var native = null;
            var others = nativeSortItems(menu);
            for (var i = 0; i < others.length; i++) {
                if (others[i].classList.contains('ur-sort-menuitem')) {
                    continue;
                }
                native = others[i].querySelector('.MuiListItemIcon-root svg, svg');
                if (native) {
                    break;
                }
            }
            if (native) {
                svg = native.cloneNode(true);
                icon.appendChild(svg);
            } else {
                icon.innerHTML = '<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeSmall ur-sort-arrow" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="fill:currentColor;width:1em;height:1em;font-size:1.25rem"><path d=""></path></svg>';
                svg = icon.querySelector('svg');
            }
        }
        svg.setAttribute('data-testid', descending ? 'ArrowDownwardIcon' : 'ArrowUpwardIcon');
        var path = svg.querySelector('path');
        if (path) {
            path.setAttribute('d', arrowPath(descending));
        }
    }

    function stripNativeSortSelection(menu) {
        nativeSortItems(menu).forEach(function (item) {
            if (item.classList.contains('ur-sort-menuitem')) {
                return;
            }
            item.classList.remove('Mui-selected');
            item.setAttribute('aria-selected', 'false');
            var icon = item.querySelector('.MuiListItemIcon-root');
            if (icon) {
                icon.innerHTML = '';
            }
        });
    }

    function paintUserSortMenu(menu) {
        var li = menu.querySelector('.ur-sort-menuitem');
        if (!li) {
            return;
        }
        var on = isUserSortOn();
        li.classList.toggle('Mui-selected', on);
        li.setAttribute('aria-selected', on ? 'true' : 'false');
        var icon = li.querySelector('.MuiListItemIcon-root');
        if (on) {
            ensureSortArrow(li, menu, userSortDescending());
            stripNativeSortSelection(menu);
        } else if (icon) {
            icon.innerHTML = '';
        }
    }

    function applyUserSortClick(ev, menu) {
        ev.preventDefault();
        ev.stopPropagation();
        if (isUserSortOn()) {
            setUserSortDir(!userSortDescending());
        } else {
            setUserSortDir(true);
        }
        applyBadgeMode();
        fullCache = { key: '', items: null, inflight: null };
        sortVisibleCards();
        paintUserSortMenu(menu);
    }

    function resetClonedSortItem(li) {
        li.classList.add('ur-sort-menuitem');
        li.classList.remove('Mui-selected');
        li.setAttribute('data-value', OPTION_VALUE);
        li.setAttribute('aria-selected', 'false');
        relabelMenuItem(li, t('sort'));
        var icon = li.querySelector('.MuiListItemIcon-root');
        if (icon) {
            icon.innerHTML = '';
        }
    }

    function injectMuiSortListbox() {
        document.querySelectorAll('ul[role="listbox"]').forEach(function (ul) {
            bindSortMenuFlagClear(ul);
            if (ul.querySelector('.ur-sort-menuitem')) {
                paintUserSortMenu(ul);
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
            resetClonedSortItem(li);
            li.addEventListener('click', function (ev) {
                applyUserSortClick(ev, ul);
            });
            comm.parentNode.insertBefore(li, comm.nextSibling);
            paintUserSortMenu(ul);
        });
    }

    function bindSortMenuFlagClear(menu) {
        if (menu.__urFlagClear) {
            return;
        }
        menu.__urFlagClear = true;
        menu.addEventListener('click', function (ev) {
            var item = ev.target.closest('[role="menuitem"], [role="option"]');
            if (!item || item.classList.contains('ur-sort-menuitem')) {
                return;
            }
            clearUserSort();
            applyBadgeMode();
            paintUserSortMenu(menu);
        });
    }

    // Jellyfin 12 experimental web: Sort is a MUI Menu (role=menu / menuitem),
    // not the older listbox. Same clone-after-Community-Rating trick.
    // Keep ListItemText/ListItemIcon — assigning textContent wipes the native arrow.
    function injectMuiSortMenu() {
        document.querySelectorAll('[role="menu"]').forEach(function (menu) {
            bindSortMenuFlagClear(menu);
            if (menu.querySelector('.ur-sort-menuitem')) {
                paintUserSortMenu(menu);
                return;
            }
            var items = menu.querySelectorAll('[role="menuitem"]');
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
            resetClonedSortItem(li);
            li.addEventListener('click', function (ev) {
                applyUserSortClick(ev, menu);
            });
            comm.parentNode.insertBefore(li, comm.nextSibling);
            paintUserSortMenu(menu);
        });
    }

    function refreshLibrary() {
        sortVisibleCards();
        var nodes = document.querySelectorAll('.itemsContainer');
        for (var i = 0; i < nodes.length; i++) {
            if (typeof nodes[i].refreshItems === 'function') {
                nodes[i].refreshItems();
            }
        }
    }

    function injectExperimentalPopover() {
        var pop = document.getElementById('sort-popover');
        if (!pop || pop.querySelector('.ur-sort-option')) {
            if (pop) {
                var btn = pop.querySelector('.ur-sort-option');
                if (btn) {
                    btn.setAttribute('data-active', isUserSortOn() ? '1' : '0');
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
        btn.setAttribute('data-active', isUserSortOn() ? '1' : '0');
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (isUserSortOn()) {
                setUserSortDir(!userSortDescending());
            } else {
                setUserSortDir(true);
            }
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
            clearUserSort();
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
        injectMuiSortMenu();
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
        // Current 10.11 route. Users/{userId}/Items/{itemId}/UserData still works but is
        // marked [Obsolete] server-side. Only Rating is sent: the endpoint is a partial
        // update, every other UserData field stays untouched.
        var url = window.ApiClient.getUrl('UserItems/' + itemId + '/UserData', { userId: userId });
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
                clearUserSort();
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
            '.ur-sort-option[data-active="1"]{border-color:#3e8ef7;color:#7cb7ff;}',
            '.ur-sort-menuitem .MuiListItemIcon-root,.ur-sort-arrow-slot{justify-content:flex-end;min-width:36px;}'
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
