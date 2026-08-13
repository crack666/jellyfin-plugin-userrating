export default function (view) {
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
            fallback.textContent = 'Aktueller Benutzer';
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
            setStatus('Benutzerliste leer — es wird der aktuelle Login verwendet.');
        });
    }

    function renderResult(data) {
        var el = view.querySelector('#urResult');
        el.classList.remove('hide');
        var dry = data.dryRun || data.DryRun;
        var unmatched = data.unmatched || data.Unmatched || [];
        var html = '<h3>' + (dry ? 'Dry-Run — nichts geschrieben' : 'Import abgeschlossen') + '</h3>';
        html += '<p>CSV: ' + (data.csvCount ?? data.CsvCount)
            + ' · Library mit ImdbId: ' + (data.libraryWithImdb ?? data.LibraryWithImdb)
            + ' · Match: ' + (data.matched ?? data.Matched)
            + ' · ' + (dry ? 'würde schreiben' : 'geschrieben') + ': ' + (data.written ?? data.Written)
            + ' · schon gleich: ' + (data.unchanged ?? data.Unchanged)
            + ' · nicht in Jellyfin: ' + (data.unmatchedCount ?? data.UnmatchedCount) + '</p>';
        if (unmatched.length) {
            html += '<p class="fieldDescription">Unmatched, höchste Note zuerst (max. 200 von ' + (data.unmatchedCount ?? data.UnmatchedCount) + '):</p><table class="detailTable" style="width:100%;">';
            html += '<thead><tr><th>IMDb</th><th>Titel</th><th>Jahr</th><th>Typ</th><th>Note</th></tr></thead><tbody>';
            unmatched.forEach(function (row) {
                html += '<tr><td>' + (row.imdbId || row.ImdbId || '') + '</td><td>'
                    + (row.title || row.Title || '') + '</td><td>' + (row.year || row.Year || '') + '</td><td>'
                    + (row.titleType || row.TitleType || '') + '</td><td>' + (row.rating ?? row.Rating) + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        el.innerHTML = html;
    }

    function runImport(dryRun) {
        var fileInput = view.querySelector('#urCsv');
        if (!fileInput.files || !fileInput.files[0]) {
            setStatus('Bitte eine IMDb-CSV wählen.');
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
        setStatus(dryRun ? 'Prüfe …' : 'Importiere …');
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
            setStatus('Fehler: ' + (err && err.message ? err.message : err));
        });
    }

    view.querySelector('#urDryRun').addEventListener('click', function () {
        runImport(true);
    });
    view.querySelector('#urImport').addEventListener('click', function () {
        if (!window.confirm('IMDb-Noten jetzt nach Jellyfin schreiben?')) {
            return;
        }
        runImport(false);
    });

    fillSelect([]);
    loadUsers();
    view.addEventListener('viewshow', loadUsers);
}
