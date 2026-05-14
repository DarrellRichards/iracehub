import { NextRequest } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const qs = request.nextUrl.searchParams.toString();

  const script = `(function () {
  var currentScript = document.currentScript;
  if (!currentScript) return;

  var leagueId = ${JSON.stringify(leagueId)};
  var baseUrl = new URL(currentScript.src);
  var feedUrl = new URL('/api/widgets/leagues/' + encodeURIComponent(leagueId), baseUrl.origin);

  if (${JSON.stringify(qs)}.length > 0) {
    feedUrl.search = ${JSON.stringify(qs)};
  }

  var targetSelector = currentScript.getAttribute('data-target');
  var container = null;

  if (targetSelector) {
    container = document.querySelector(targetSelector);
  }

  if (!container) {
    container = document.createElement('div');
    currentScript.parentNode && currentScript.parentNode.insertBefore(container, currentScript.nextSibling);
  }

  function resolveOption(name, fallback) {
    var dataValue = currentScript.getAttribute('data-' + name);
    if (dataValue && dataValue.trim().length > 0) return dataValue.trim();
    var queryValue = baseUrl.searchParams.get(name);
    if (queryValue && queryValue.trim().length > 0) return queryValue.trim();
    return fallback;
  }

  var widgetView = (resolveOption('view', 'all') || 'all').toLowerCase();
  var widgetTheme = (resolveOption('theme', 'light') || 'light').toLowerCase();
  var compactMode = resolveOption('compact', 'false') === 'true' || resolveOption('density', 'comfortable') === 'compact';
  var showTitle = resolveOption('show-title', 'true') !== 'false';
  var maxWidth = resolveOption('max-width', '560px');

  var themePresets = {
    light: {
      bg: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      muted: '#374151',
      sectionBorder: '#f3f4f6',
      accent: '#ef4444',
    },
    dark: {
      bg: '#0f172a',
      text: '#e5e7eb',
      border: '#334155',
      muted: '#94a3b8',
      sectionBorder: '#1e293b',
      accent: '#f43f5e',
    },
  };

  var selectedTheme = themePresets[widgetTheme] || themePresets.light;
  var colorBg = resolveOption('bg', selectedTheme.bg);
  var colorText = resolveOption('text', selectedTheme.text);
  var colorBorder = resolveOption('border', selectedTheme.border);
  var colorAccent = resolveOption('accent', selectedTheme.accent);
  var noBackground = colorBg.toLowerCase() === 'transparent' || colorBg.toLowerCase() === 'none';
  var backgroundValue = noBackground ? 'transparent' : colorBg;

  function shouldRenderSection(name) {
    return widgetView === 'all' || widgetView === name;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(dateValue) {
    if (!dateValue) return 'TBD';
    var date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'TBD';
    return date.toLocaleString();
  }

  function fmtNum(value, fallback) {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return String(value);
  }

  function renderLoading() {
    container.innerHTML = '<div class="irh-widget irh-widget--loading">Loading iRaceHub widget…</div>';
  }

  function renderError() {
    container.innerHTML = '<div class="irh-widget irh-widget--error">Widget data unavailable.</div>';
  }

  function section(title, body) {
    return '<section class="irh-widget__section"><h3>' + escapeHtml(title) + '</h3>' + body + '</section>';
  }

  function render(data) {
    var upcoming = data.upcomingEvent;
    var latest = data.latestRaceResults;
    var standings = data.standingsUpdate && Array.isArray(data.standingsUpdate.standings)
      ? data.standingsUpdate.standings
      : [];
    var schedule = Array.isArray(data.schedule) ? data.schedule : [];

    var upcomingBody = data.permissions && data.permissions.scheduleVisible
      ? (upcoming
          ? '<p><strong>' + escapeHtml(upcoming.raceName || 'Upcoming Event') + '</strong><br>' +
            escapeHtml(upcoming.trackName || 'Track TBD') + '<br>' +
            escapeHtml(fmtDate(upcoming.eventDate)) + '</p>'
          : '<p>No upcoming event.</p>')
      : '<p>Schedule is private.</p>';

    var latestBody = data.permissions && data.permissions.resultsVisible
      ? (latest
          ? '<p><strong>' + escapeHtml((latest.schedule && latest.schedule.raceName) || 'Latest Race') + '</strong><br>' +
            'Winner: ' + escapeHtml(latest.winnerName || 'N/A') + '<br>' +
            escapeHtml(fmtDate(latest.launchAt)) + '</p>' +
            (Array.isArray(latest.results) && latest.results.length
              ? '<div class="irh-widget__table-wrap"><table class="irh-widget__table"><thead><tr>' +
                '<th>Pos</th><th>Driver</th>' +
                (compactMode ? '' : '<th>Start</th><th>Laps</th><th>Inc</th>') +
                '<th>Pts</th>' +
                (compactMode ? '' : '<th>Prov</th>') +
                '</tr></thead><tbody>' +
                latest.results.map(function (r) {
                  return '<tr>' +
                    '<td>' + escapeHtml(fmtNum(r.finishPosition, '-')) + '</td>' +
                    '<td>' + escapeHtml(r.displayName || 'Driver') + '</td>' +
                    (compactMode ? '' : '<td>' + escapeHtml(fmtNum(r.startPosition, '-')) + '</td>') +
                    (compactMode ? '' : '<td>' + escapeHtml(fmtNum(r.lapsCompleted, '-')) + '</td>') +
                    (compactMode ? '' : '<td>' + escapeHtml(fmtNum(r.incidents, '-')) + '</td>') +
                    '<td>' + escapeHtml(fmtNum(r.finalPoints, '0')) + '</td>' +
                    (compactMode ? '' : '<td>' + (r.provisional ? 'Yes' : 'No') + '</td>') +
                  '</tr>';
                }).join('') +
                '</tbody></table></div>'
              : '<p>No race results rows yet.</p>')
          : '<p>No race results yet.</p>')
      : '<p>Results are private.</p>';

    var standingsBody = data.permissions && data.permissions.standingsVisible
      ? (standings.length
          ? '<div class="irh-widget__table-wrap"><table class="irh-widget__table"><thead><tr>' +
            '<th>Rank</th><th>Driver</th><th>Pts</th><th>Gap</th>' +
            (compactMode ? '' : '<th>Starts</th><th>Wins</th><th>Top5</th><th>Avg Fin</th>') +
            '</tr></thead><tbody>' +
            standings.map(function (s, idx) {
              return '<tr>' +
                '<td>' + String(idx + 1) + '</td>' +
                '<td>' + escapeHtml(s.displayName || 'Driver') + '</td>' +
                '<td>' + escapeHtml(fmtNum(s.points, '0')) + '</td>' +
                '<td>' + escapeHtml(fmtNum(s.gapToLeader, '0')) + '</td>' +
                (compactMode ? '' : '<td>' + escapeHtml(fmtNum(s.starts, '0')) + '</td>') +
                (compactMode ? '' : '<td>' + escapeHtml(fmtNum(s.wins, '0')) + '</td>') +
                (compactMode ? '' : '<td>' + escapeHtml(fmtNum(s.top5, '0')) + '</td>') +
                (compactMode ? '' : '<td>' + escapeHtml(fmtNum(s.avgFinish, '-')) + '</td>') +
              '</tr>';
            }).join('') +
            '</tbody></table></div>'
          : '<p>No standings yet.</p>')
      : '<p>Standings are private.</p>';

    var scheduleBody = data.permissions && data.permissions.scheduleVisible
      ? (schedule.length
          ? '<ul class="irh-widget__list">' + schedule.slice(0, 8).map(function (e) {
              return '<li><strong>' + escapeHtml(e.raceName || 'Event') + '</strong> — ' + escapeHtml(fmtDate(e.eventDate)) + '</li>';
            }).join('') + '</ul>'
          : '<p>No scheduled events.</p>')
      : '<p>Schedule is private.</p>';

    var sections = [];
    if (shouldRenderSection('upcoming')) sections.push(section('Upcoming Event', upcomingBody));
    if (shouldRenderSection('results')) sections.push(section('Latest Race Results', latestBody));
    if (shouldRenderSection('standings')) sections.push(section('Standings', standingsBody));
    if (shouldRenderSection('schedule')) sections.push(section('Schedule', scheduleBody));

    if (sections.length === 0) {
      sections.push('<section class="irh-widget__section"><p>No widget view selected.</p></section>');
    }

    var gridClass = widgetView === 'all' ? 'irh-widget__grid' : 'irh-widget__grid irh-widget__grid--single';

    container.innerHTML =
      '<style>' +
      '.irh-widget{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid ' + colorBorder + ';border-radius:10px;padding:14px;color:' + colorText + ';background:' + backgroundValue + ';max-width:' + escapeHtml(maxWidth) + ';}' +
      '.irh-widget h2{margin:0 0 10px 0;font-size:16px;line-height:1.3;}' +
      '.irh-widget h3{margin:0 0 6px 0;font-size:13px;line-height:1.3;color:' + colorAccent + ';}' +
      '.irh-widget p{margin:0;font-size:13px;line-height:1.4;color:' + colorText + ';}' +
      '.irh-widget__grid{display:grid;grid-template-columns:1fr;gap:10px;}' +
      '.irh-widget__grid--single{grid-template-columns:1fr !important;}' +
      '.irh-widget__section{border-top:1px solid ' + selectedTheme.sectionBorder + ';padding-top:10px;}' +
      '.irh-widget__list{margin:4px 0 0 16px;padding:0;font-size:12px;line-height:1.45;}' +
      '.irh-widget__table-wrap{overflow:auto;margin-top:8px;}' +
      '.irh-widget__table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.4;}' +
      '.irh-widget__table th,.irh-widget__table td{border:1px solid ' + colorBorder + ';padding:4px 6px;text-align:left;white-space:nowrap;}' +
      '.irh-widget__table thead th{background:' + (noBackground ? selectedTheme.sectionBorder : colorBg) + ';font-weight:600;}' +
      '.irh-widget li{color:' + colorText + ';}' +
      '.irh-widget--loading,.irh-widget--error{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid ' + colorBorder + ';border-radius:10px;padding:12px;color:' + selectedTheme.muted + ';background:' + backgroundValue + ';}' +
      '@media (min-width:700px){.irh-widget__grid{grid-template-columns:1fr 1fr;}}' +
      '</style>' +
      '<div class="irh-widget">' +
      (showTitle ? '<h2>' + escapeHtml((data.league && data.league.leagueName) || 'iRaceHub League') + '</h2>' : '') +
      '<div class="' + gridClass + '">' +
      sections.join('') +
      '</div>' +
      '</div>';
  }

  renderLoading();

  fetch(feedUrl.toString(), { method: 'GET' })
    .then(function (response) {
      if (!response.ok) throw new Error('feed_request_failed');
      return response.json();
    })
    .then(render)
    .catch(function () {
      renderError();
    });
})();`;

  return new Response(script, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control":
        "public, max-age=120, s-maxage=120, stale-while-revalidate=240",
    },
  });
}
