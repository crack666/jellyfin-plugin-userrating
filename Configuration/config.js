export default function (view) {
    var PAGE_SIZE_KEY = 'jf-userrating-unmatched-pagesize';
    var unmatchedRows = [];
    var unmatchedPage = 0;
    var sortKey = 'rating';
    var sortDir = 'desc';
    var lastResult = null;

    function t(key) {
        return (window.UserRatingI18n && window.UserRatingI18n.t)
            ? window.UserRatingI18n.t(key)
            : key;
    }

    function tf(key, map) {
        if (window.UserRatingI18n && window.UserRatingI18n.format) {
            return window.UserRatingI18n.format(key, map);
        }
        var s = t(key);
        Object.keys(map || {}).forEach(function (k) {
            s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(map[k]));
        });
        return s;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function ensureI18n() {
        if (window.UserRatingI18n) {
            return Promise.resolve();
        }
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = '/UserRating/i18n.js';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    function applyStaticI18n() {
        var intro = view.querySelector('#urIntro');
        if (intro) {
            intro.innerHTML = t('intro')
                + ' <a is="emby-linkbutton" class="button-link" href="https://github.com/crack666/jellyfin-plugin-userrating" target="_blank" rel="noopener">github.com/crack666/jellyfin-plugin-userrating</a>';
        }
        setText('#urImportHeading', t('importHeading'));
        var desc = view.querySelector('#urImportDesc');
        if (desc) {
            desc.innerHTML = t('importDesc');
        }
        setText('#urCsvLabel', t('csvFile'));
        setText('#urUserLabel', t('user'));
        setText('#urMoviesLabel', t('movies'));
        setText('#urSeriesLabel', t('series'));
        setText('#urDryRun', t('dryRun'));
        setText('#urImport', t('import'));
    }

    function setText(sel, text) {
        var el = view.querySelector(sel);
        if (el) {
            el.textContent = text;
        }
    }

    function setStatus(text) {
        view.querySelector('#urStatus').textContent = text || '';
    }

    function selectedTypes() {
        var types = [];
        if (view.querySelector('#urMovies').checked) {
            types.push('Movie');
        }
        if (view.querySelector('#urSeries').checked) {
            types.push('Series');
        }
        return types.length ? types.join(',') : 'Movie,Series';
    }

    function fillSelect(users) {
        var sel = view.querySelector('#urUser');
        var current = ApiClient.getCurrentUserId();
        sel.innerHTML = '';
        (users || []).forEach(function (u) {
            var id = u.id || u.Id;
            var name = u.name || u.Name || u.username || u.Username || id;
            var opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            if (id === current) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        if (!sel.options.length && current) {
            var fallback = document.createElement('option');
            fallback.value = current;
            fallback.textContent = t('currentUser');
            fallback.selected = true;
            sel.appendChild(fallback);
        }
    }

    function loadUsers() {
        var token = ApiClient.accessToken();
        fetch(ApiClient.getUrl('UserRating/Users'), {
            headers: { 'X-Emby-Authorization': 'MediaBrowser Token="' + token + '"', 'X-Emby-Token': token }
        }).then(function (res) {
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        }).then(fillSelect).catch(function () {
            if (typeof ApiClient.getUsers === 'function') {
                return ApiClient.getUsers().then(fillSelect);
            }
            throw new Error('users');
        }).catch(function () {
            fillSelect([]);
            setStatus(t('usersFallback'));
        });
    }

    function imdbCell(id) {
        var raw = String(id || '').trim();
        var shown = esc(raw);
        if (/^tt\d+$/i.test(raw)) {
            return '<a class="button-link" href="https://www.imdb.com/title/' + encodeURIComponent(raw) + '/" target="_blank" rel="noopener">' + shown + '</a>';
        }
        return shown;
    }

    function storedPageSize() {
        try {
            var v = localStorage.getItem(PAGE_SIZE_KEY);
            if (v === '0' || v === 'all') {
                return 0;
            }
            var n = parseInt(v, 10);
            if (n === 50 || n === 100 || n === 200 || n === 500) {
                return n;
            }
        } catch (e) { /* private mode */ }
        return 200;
    }

    function effectivePageSize() {
        var n = storedPageSize();
        return n === 0 ? Math.max(unmatchedRows.length, 1) : n;
    }

    function pagerHtml(from, to, total, pages) {
        var size = storedPageSize();
        var html = '<div class="ur-pager" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:12px 0;">';
        html += '<button type="button" class="raised emby-button" data-ur-page="prev"'
            + (unmatchedPage <= 0 ? ' disabled' : '') + '>' + esc(t('pagePrev')) + '</button>';
        html += '<span class="fieldDescription">' + esc(tf('pageStatus', { from: from, to: to, total: total })) + '</span>';
        html += '<button type="button" class="raised emby-button" data-ur-page="next"'
            + (unmatchedPage >= pages - 1 ? ' disabled' : '') + '>' + esc(t('pageNext')) + '</button>';
        html += '<label class="ur-pagesize-label">'
            + esc(t('pageSize'))
            + ' <span class="ur-pagesize-wrap"><select data-ur-pagesize class="ur-pagesize">';
        [50, 100, 200, 500].forEach(function (n) {
            html += '<option value="' + n + '"' + (size === n ? ' selected' : '') + '>' + n + '</option>';
        });
        html += '<option value="0"' + (size === 0 ? ' selected' : '') + '>' + esc(t('pageAll')) + '</option>';
        html += '</select></span></label></div>';
        return html;
    }

    function rowVal(row, key) {
        if (key === 'imdb') {
            return String(row.imdbId || row.ImdbId || '').toLowerCase();
        }
        if (key === 'title') {
            return String(row.title || row.Title || '').toLowerCase();
        }
        if (key === 'year') {
            return parseInt(row.year || row.Year, 10) || 0;
        }
        if (key === 'type') {
            return String(row.titleType || row.TitleType || '').toLowerCase();
        }
        return Number(row.rating ?? row.Rating) || 0;
    }

    function sortedRows() {
        var key = sortKey;
        var dir = sortDir === 'asc' ? 1 : -1;
        return unmatchedRows.slice().sort(function (a, b) {
            var va = rowVal(a, key);
            var vb = rowVal(b, key);
            if (va < vb) {
                return -1 * dir;
            }
            if (va > vb) {
                return 1 * dir;
            }
            var ra = rowVal(a, 'rating');
            var rb = rowVal(b, 'rating');
            if (ra !== rb) {
                return rb - ra;
            }
            return String(rowVal(a, 'title')).localeCompare(String(rowVal(b, 'title')));
        });
    }

    function thHtml(key, label) {
        var active = sortKey === key;
        var aria = active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none';
        var mark = active ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';
        return '<th class="ur-th" data-ur-sort="' + key + '" role="columnheader" aria-sort="' + aria
            + '">' + esc(label) + mark + '</th>';
    }

    function ensureTableCss() {
        if (document.getElementById('ur-config-style')) {
            return;
        }
        var css = document.createElement('style');
        css.id = 'ur-config-style';
        css.textContent = [
            '.ur-pagesize-label{margin-left:auto;display:inline-flex;align-items:center;gap:8px;color:inherit;font:inherit;}',
            '.ur-pagesize-wrap{position:relative;display:inline-block;}',
            '.ur-pagesize-wrap::after{content:"";position:absolute;right:.7em;top:50%;width:0;height:0;border:.35em solid transparent;border-top-color:currentColor;transform:translateY(-15%);pointer-events:none;opacity:.75;}',
            '.ur-pagesize{min-width:5.75em;height:2.15em;padding:.25em 1.9em .25em .7em;color:inherit;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);border-radius:.3em;font:inherit;cursor:pointer;appearance:none;-webkit-appearance:none;}',
            '.ur-pagesize:hover{background:rgba(255,255,255,.12);}',
            '.ur-pagesize:focus{border-color:#00a4dc;outline:none;}',
            '.ur-th{cursor:pointer;user-select:none;white-space:nowrap;}',
            '.ur-th:hover,.ur-th[aria-sort="ascending"],.ur-th[aria-sort="descending"]{color:#7cb7ff;}'
        ].join('');
        document.head.appendChild(css);
    }

    function renderUnmatchedTable(opts) {
        var host = view.querySelector('#urUnmatchedWrap');
        if (!host) {
            return;
        }
        var rows = sortedRows();
        var total = rows.length;
        var pageSize = effectivePageSize();
        var pages = Math.max(1, Math.ceil(total / pageSize));
        if (unmatchedPage >= pages) {
            unmatchedPage = pages - 1;
        }
        if (unmatchedPage < 0) {
            unmatchedPage = 0;
        }
        var start = unmatchedPage * pageSize;
        var slice = rows.slice(start, start + pageSize);
        var from = total ? start + 1 : 0;
        var to = start + slice.length;
        var pager = pagerHtml(from, to, total, pages);
        var html = '<p class="fieldDescription">' + t('unmatchedHint') + '</p>';
        html += pager;
        html += '<table class="detailTable" style="width:100%;">';
        html += '<thead><tr>'
            + thHtml('imdb', t('colImdb'))
            + thHtml('title', t('colTitle'))
            + thHtml('year', t('colYear'))
            + thHtml('type', t('colType'))
            + thHtml('rating', t('colRating'))
            + '</tr></thead><tbody>';
        slice.forEach(function (row) {
            html += '<tr><td>' + imdbCell(row.imdbId || row.ImdbId)
                + '</td><td>' + esc(row.title || row.Title || '')
                + '</td><td>' + esc(row.year || row.Year || '')
                + '</td><td>' + esc(row.titleType || row.TitleType || '')
                + '</td><td>' + esc(row.rating ?? row.Rating) + '</td></tr>';
        });
        html += '</tbody></table>';
        html += pager;
        host.innerHTML = html;
        if (opts && opts.scroll) {
            host.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
    }

    function renderResult(data) {
        lastResult = data;
        var el = view.querySelector('#urResult');
        el.classList.remove('hide');
        var dry = data.dryRun || data.DryRun;
        unmatchedRows = data.unmatched || data.Unmatched || [];
        unmatchedPage = 0;
        sortKey = 'rating';
        sortDir = 'desc';
        var html = '<h3>' + esc(dry ? t('resultDry') : t('resultDone')) + '</h3>';
        html += '<p>' + esc(t('statCsv')) + ': ' + (data.csvCount ?? data.CsvCount)
            + ' · ' + esc(t('statLibrary')) + ': ' + (data.libraryWithImdb ?? data.LibraryWithImdb)
            + ' · ' + esc(t('statMatch')) + ': ' + (data.matched ?? data.Matched)
            + ' · ' + esc(dry ? t('statWouldWrite') : t('statWritten')) + ': ' + (data.written ?? data.Written)
            + ' · ' + esc(t('statUnchanged')) + ': ' + (data.unchanged ?? data.Unchanged)
            + ' · ' + esc(t('statUnmatched')) + ': ' + (data.unmatchedCount ?? data.UnmatchedCount) + '</p>';
        if (unmatchedRows.length) {
            html += '<div id="urUnmatchedWrap"></div>';
        }
        el.innerHTML = html;
        if (unmatchedRows.length) {
            renderUnmatchedTable();
        }
    }

    function runImport(dryRun) {
        var fileInput = view.querySelector('#urCsv');
        if (!fileInput.files || !fileInput.files[0]) {
            setStatus(t('pickCsv'));
            return;
        }
        var userId = view.querySelector('#urUser').value || ApiClient.getCurrentUserId();
        var url = ApiClient.getUrl('UserRating/Import', {
            dryRun: dryRun,
            userId: userId,
            types: selectedTypes()
        });
        var form = new FormData();
        form.append('file', fileInput.files[0]);
        setStatus(dryRun ? t('checking') : t('importing'));
        view.querySelector('#urResult').classList.add('hide');
        var token = ApiClient.accessToken();
        fetch(url, {
            method: 'POST',
            headers: {
                'X-Emby-Token': token,
                'X-Emby-Authorization': 'MediaBrowser Token="' + token + '"'
            },
            body: form
        }).then(function (res) {
            return res.text().then(function (text) {
                if (!res.ok) {
                    throw new Error(text || ('HTTP ' + res.status));
                }
                return JSON.parse(text);
            });
        }).then(function (data) {
            setStatus('');
            renderResult(data);
        }).catch(function (err) {
            setStatus(t('errorPrefix') + (err && err.message ? err.message : err));
        });
    }

    view.querySelector('#urResult').addEventListener('click', function (ev) {
        var th = ev.target.closest && ev.target.closest('[data-ur-sort]');
        if (th) {
            ev.preventDefault();
            var key = th.getAttribute('data-ur-sort');
            if (sortKey === key) {
                sortDir = sortDir === 'desc' ? 'asc' : 'desc';
            } else {
                sortKey = key;
                sortDir = (key === 'rating' || key === 'year') ? 'desc' : 'asc';
            }
            unmatchedPage = 0;
            renderUnmatchedTable();
            return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-ur-page]');
        if (!btn || btn.disabled) {
            return;
        }
        ev.preventDefault();
        if (btn.getAttribute('data-ur-page') === 'prev') {
            unmatchedPage -= 1;
        } else {
            unmatchedPage += 1;
        }
        renderUnmatchedTable({ scroll: true });
    });
    view.querySelector('#urResult').addEventListener('change', function (ev) {
        var sel = ev.target.closest && ev.target.closest('[data-ur-pagesize]');
        if (!sel) {
            return;
        }
        var start = unmatchedPage * effectivePageSize();
        try {
            localStorage.setItem(PAGE_SIZE_KEY, sel.value);
        } catch (e) { /* private mode */ }
        unmatchedPage = Math.floor(start / effectivePageSize());
        renderUnmatchedTable({ scroll: true });
    });

    view.querySelector('#urDryRun').addEventListener('click', function () {
        runImport(true);
    });
    view.querySelector('#urImport').addEventListener('click', function () {
        if (!window.confirm(t('confirmImport'))) {
            return;
        }
        runImport(false);
    });

    fillSelect([]);
    ensureTableCss();
    ensureI18n().then(function () {
        applyStaticI18n();
        loadUsers();
    });
    view.addEventListener('viewshow', function () {
        ensureI18n().then(function () {
            applyStaticI18n();
            loadUsers();
            if (lastResult) {
                renderResult(lastResult);
            }
        });
    });
}
