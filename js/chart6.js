// chart6.js - renders a line plot (from chart6.1_dataset.csv) and a bar chart (from chart6_dataset.csv)
// Uses the same page template/IDs as chart5.html. Targets the SVG with id `#chart5-single` and status `#chart5-status`.

const lineDataPath = './data_knime/chart6.1_dataset.csv';
const barDataPath = './data_knime/chart6_dataset.csv';
let lineRaw = null;
let barRaw = null;

console.log('chart6.js module loaded');
if (typeof d3 === 'undefined') console.error('D3 not found: make sure d3.v7 is loaded before chart6.js');

function formatNumber(n) { return new Intl.NumberFormat('en-AU').format(n); }

function setStatus(msg) { try { document.getElementById('chart5-status').innerText = msg; } catch (e) {} }

// parse bar CSV: YEAR, JURISDICTION, Max*(FINES PER 10K)
function parseBarRow(d) {
    return {
        YEAR: +d.YEAR,
        JURISDICTION: d.JURISDICTION,
        // Locate the column that mentions 'FINES' (case-insensitive) and parse it.
        // Keeps parsing defensive to tolerate slightly varying column headers.
        VALUE: +(d[Object.keys(d).find(k => k.toUpperCase().includes('FINES'))] || 0)
    };
}

// Load both datasets, then initialize controls
Promise.all([
    d3.csv(lineDataPath),
    d3.csv(barDataPath, parseBarRow)
]).then(([rawLine, rawBar]) => {
    console.log('chart6: CSVs loaded', rawLine.length, rawBar.length);
    lineRaw = rawLine;
    barRaw = rawBar;

    // Build list of years (union) in descending order
    const yearsLine = Array.from(new Set(lineRaw.map(d => +d.YEAR))).map(Number);
    const yearsBar = Array.from(new Set(barRaw.map(d => +d.YEAR))).map(Number);
    const years = Array.from(new Set([...yearsLine, ...yearsBar])).sort((a,b) => b - a);

    // Populate year filter (descending)
    const yearSelect = d3.select('#year-filter');
    if (!yearSelect.empty()) {
        yearSelect.selectAll('option').remove();
        years.forEach(y => yearSelect.append('option').attr('value', y).text(y));
        yearSelect.node().value = years[0] || '';
    }

    // ensure visible display labels for selects (fallback for browsers that hide select text)
    // This function creates a small `.select-display` element inside the select
    // wrapper and mirrors the selected option text. The project prefers native
    // selects, so these display elements are hidden later once populated.
    function ensureSelectDisplay(id) {
        const sel = document.getElementById(id);
        if (!sel) return;
        // find wrapper
        let wrap = sel.parentElement;
        if (!wrap || !wrap.classList.contains('select-wrapper')) wrap = sel.parentElement;
        let disp = wrap.querySelector('.select-display');
        if (!disp) {
            disp = document.createElement('span');
            disp.className = 'select-display';
            wrap.insertBefore(disp, sel);
        }
        
        const update = () => {
            try {
                const opt = sel.options[sel.selectedIndex];
                disp.innerText = opt ? opt.text : '';
            } catch (e) {
                disp.innerText = sel.value || '';
            }
        };
        
        update();
        sel.addEventListener('change', update);
        sel.addEventListener('input', update);
    }

    ensureSelectDisplay('jurisdiction-filter');
    ensureSelectDisplay('offense-type-filter');
    ensureSelectDisplay('year-filter');

    // Hide any .select-display elements after creation — prefer the native
    // select rendering where possible to avoid duplicate visual text overlays.
    document.querySelectorAll('.select-display').forEach(el => el.style.display = 'none');

    // Parse line dataset: columns like "ACT+Max*(Max*(FINES PER 10K))".
    // We will extract the region name before the first '+' and build series per region.
    const lineColumns = rawLine.columns.filter(c => c !== 'YEAR');
    const regions = lineColumns.map(c => ({ raw: c, name: c.split('+')[0] }));

    // jurisdiction filter: union of regions + JURISDICTIONs from bar dataset
    const jurisdictions = Array.from(new Set([
        ...regions.map(r => r.name),
        ...new Set(barRaw.map(d => d.JURISDICTION))
    ])).sort();

    const locSelect = d3.select('#jurisdiction-filter');
    if (!locSelect.empty()) {
        locSelect.selectAll('option').remove();
        locSelect.append('option').attr('value','All').text('All');
        jurisdictions.forEach(l => locSelect.append('option').attr('value', l).text(l));
        locSelect.node().value = 'All';
    }

    // offense-type filter: decide whether to show LINE or BAR
    const offSelect = d3.select('#offense-type-filter');
    if (!offSelect.empty()) {
        offSelect.selectAll('option').remove();
        offSelect.append('option').attr('value','LINE').text('Line: Fines per 10k (states)');
        offSelect.append('option').attr('value','BAR').text('Bar: Max fines per 10k (jurisdictions)');
        offSelect.node().value = 'LINE';
    }

    // Build line series structure: [{ id: 'ACT', values: [{year:2010, value: 4171.64}, ...] }, ...]
    // Note: some CSV cells may be empty or non-numeric. Coerce to NaN, then
    // replace NaN with null so `line.defined()` will skip missing points.
    const series = regions.map(r => ({ id: r.name, rawKey: r.raw, values: lineRaw.map(row => ({ year: +row.YEAR, value: +(row[r.raw] || '') ? +row[r.raw] : NaN })) }));

    // clean values: replace NaN with null so they won't plot (line.defined will skip)
    series.forEach(s => s.values.forEach(v => { if (Number.isNaN(v.value)) v.value = null; }));

    // draw initial view
    function draw() {
        const view = document.getElementById('offense-type-filter') ? document.getElementById('offense-type-filter').value : 'LINE';
        const year = Number(document.getElementById('year-filter') ? document.getElementById('year-filter').value : years[0]) || years[0];
        const jurisdiction = document.getElementById('jurisdiction-filter') ? document.getElementById('jurisdiction-filter').value : 'All';

        if (view === 'LINE') {
            // which regions to show? if jurisdiction != All, show only that region
            const toShow = jurisdiction === 'All' ? series : series.filter(s => s.id === jurisdiction);
            if (!toShow || toShow.length === 0) {
                setStatus('the dataset does not have this criteria recorded');
                renderNoData();
                return;
            }
            setStatus(`Showing line plot — ${toShow.length} series`);
            renderLineChart('#chart5-single', toShow);
            d3.select('#chart5-subtitle').text('Fines per 10k — states (line)');
            d3.select('#chart5-title').text(`Fines Per 10k License Holders — Jurisdiction`);
            // metrics: compute latest-year totals for primary metric
            const latestYear = years[0];
            const totals = d3.sum(series, s => {
                const v = s.values.find(x => x.year === latestYear);
                return v && v.value ? v.value : 0;
            });
            d3.select('#police-fines-metric').text(formatNumber(Math.round(totals)));
            d3.select('#metric-year').text(latestYear);
            // highest region for latestYear
            const byLatest = series.map(s => ({ id: s.id, value: (s.values.find(x => x.year === latestYear) || {}).value || 0 }));
            byLatest.sort((a,b) => b.value - a.value);
            if (byLatest[0] && byLatest[0].value > 0) d3.select('#highest-location').text(`${formatNumber(Math.round(byLatest[0].value))} Highest ${byLatest[0].id}, ${latestYear}`);
            else d3.select('#highest-location').text('N/A');

            // compute highest / lowest / mean fines per 10k for latestYear from barRaw
            const valuesForLatest = (barRaw || []).filter(r => r.YEAR === latestYear).map(r => (r.VALUE != null && !isNaN(r.VALUE)) ? +r.VALUE : null).filter(v => v != null);
            if (!valuesForLatest || valuesForLatest.length === 0) {
                d3.select('#fines-metric').text('N/A');
                d3.select('#charges-metric').text('N/A');
                d3.select('#arrests-metric').text('N/A');
            } else {
                const highest = Math.max(...valuesForLatest);
                const lowest = Math.min(...valuesForLatest);
                const mean = valuesForLatest.reduce((a,b) => a + b, 0) / valuesForLatest.length;
                d3.select('#fines-metric').text(formatNumber(Math.round(highest)));
                d3.select('#charges-metric').text(formatNumber(Math.round(lowest)));
                d3.select('#arrests-metric').text(formatNumber(Math.round(mean)));
            }

        } else {
            // BAR view: aggregate barRaw for selected year and optional jurisdiction filter
            const bars = barRaw.filter(r => r.YEAR === year);
            const filtered = (jurisdiction && jurisdiction !== 'All') ? bars.filter(r => r.JURISDICTION === jurisdiction) : bars;
            if (!filtered || filtered.length === 0) {
                setStatus('the dataset does not have this criteria recorded');
                renderNoData();
                return;
            }
            setStatus(`Showing bar chart — ${filtered.length} bars (${year})`);
            // prepare series: [{key: JURISDICTION, value}]
            const barSeries = filtered.map(r => ({ key: r.JURISDICTION, value: +r.VALUE }));
            barSeries.sort((a,b) => b.value - a.value);
            renderBarChart('#chart5-single', barSeries);
            d3.select('#chart5-subtitle').text('Max fines per 10k — by jurisdictions');
            d3.select('#chart5-title').text(`Fines Per 10k License Holders— ${year}`);
            d3.select('#police-fines-metric').text(formatNumber(Math.round(d3.sum(barSeries, d => d.value))));
            d3.select('#metric-year').text(year);
            if (barSeries[0] && barSeries[0].value > 0) d3.select('#highest-location').text(`${formatNumber(Math.round(barSeries[0].value))} Highest ${barSeries[0].key}, ${year}`);
            else d3.select('#highest-location').text('N/A');

            // compute highest / lowest / mean for this barSeries
            const vals = barSeries.map(d => d.value).filter(v => v != null && !isNaN(v));
            if (!vals || vals.length === 0) {
                d3.select('#fines-metric').text('N/A');
                d3.select('#charges-metric').text('N/A');
                d3.select('#arrests-metric').text('N/A');
            } else {
                const highest = Math.max(...vals);
                const lowest = Math.min(...vals);
                const mean = vals.reduce((a,b) => a + b, 0) / vals.length;
                d3.select('#fines-metric').text(formatNumber(Math.round(highest)));
                d3.select('#charges-metric').text(formatNumber(Math.round(lowest)));
                d3.select('#arrests-metric').text(formatNumber(Math.round(mean)));
            }
        }
    }

    // wire controls
    const redraw = () => draw();
    const ysel = document.getElementById('year-filter'); if (ysel) ysel.addEventListener('change', redraw);
    const jsel = document.getElementById('jurisdiction-filter'); if (jsel) jsel.addEventListener('change', redraw);
    const ofsel = document.getElementById('offense-type-filter'); if (ofsel) ofsel.addEventListener('change', redraw);

    // initial draw
    draw();

    // Note: chart renderers animate themselves on each draw.

}).catch(err => {
    console.error('chart6: failed to load CSVs', err);
    setStatus('Failed to load data (see console)');
});

// Render helpers
// Render helpers
// Each renderer clears the SVG and draws either a helpful message or the
// requested chart. Animations (stroke-dashoffset for lines, transitions for
// bars/points) are applied to make redraws feel responsive.
function renderNoData() {
    const svg = d3.select('#chart5-single');
    svg.selectAll('*').remove();
    svg.append('text').attr('x', 10).attr('y', 20).attr('fill', '#666').style('font-size','14px').text('the dataset does not have this criteria recorded');
}

function renderBarChart(svgSelector, series, opts = {}) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();
    if (!series || !series.length) {
        renderNoData();
        return;
    }

    const container = svg.node();
    const bbox = container.getBoundingClientRect();
    const margin = { top: 20, right: 10, bottom: 80, left: 80 };
    const width = Math.max(300, bbox.width) - margin.left - margin.right;
    const height = (parseInt(svg.attr('height')) || 420) - margin.top - margin.bottom;

    const g = svg.attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(series.map(d => d.key)).range([0, width]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.value) || 1]).nice().range([height, 0]);

    const xAxis = d3.axisBottom(x);
    const yAxis = d3.axisLeft(y).ticks(6, 's');

    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis)
        .selectAll('text').attr('transform','rotate(-30)').style('text-anchor','end');
    g.append('g').call(yAxis);

    const bars = g.selectAll('.bar').data(series).enter().append('rect')
        .attr('class','bar')
        .attr('x', d => x(d.key))
        .attr('width', x.bandwidth())
        .attr('y', d => y(0))
        .attr('height', 0)
        .attr('fill', opts.fill || '#1f77b4');

    // animate bars immediately so the chart builds on load and on redraw
    bars.transition().duration(opts.duration || 900).attr('y', d => y(d.value)).attr('height', d => Math.max(0, height - y(d.value)));

    const labels = g.selectAll('.label').data(series).enter().append('text')
        .attr('class','label')
        .attr('x', d => x(d.key) + x.bandwidth()/2)
        .attr('y', d => y(0) - 6)
        .attr('text-anchor','middle')
        .style('font-size','11px')
        .style('opacity', 0)
        .text(d => d.value ? formatNumber(Math.round(d.value)) : '');

    // animate labels into place after bars
    labels.transition().delay(600).duration(opts.duration || 600).attr('y', d => y(d.value) - 6).style('opacity', 1);

    let tooltip = d3.select('body').select('.tooltip');
    if (tooltip.empty()) tooltip = d3.select('body').append('div').attr('class','tooltip').style('opacity',0);
    bars.on('mouseover', (event, d) => tooltip.style('opacity',1).html(`<strong>${d.key}</strong><br/>${formatNumber(d.value)}`))
        .on('mousemove', (event) => tooltip.style('left',(event.pageX+10)+'px').style('top',(event.pageY-28)+'px'))
        .on('mouseout', () => tooltip.style('opacity',0));
}

function renderLineChart(svgSelector, series, opts = {}) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();
    if (!series || !series.length) { renderNoData(); return; }

    const container = svg.node();
    const bbox = container.getBoundingClientRect();
    const margin = { top: 20, right: 120, bottom: 50, left: 60 };
    const width = Math.max(360, bbox.width) - margin.left - margin.right;
    const height = (parseInt(svg.attr('height')) || 420) - margin.top - margin.bottom;

    const g = svg.attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // x domain: union of years across series
    const years = Array.from(new Set(series.flatMap(s => s.values.map(v => v.year)))).sort((a,b) => a - b);
    const x = d3.scaleLinear().domain([d3.min(years), d3.max(years)]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(series, s => d3.max(s.values, v => v.value) || 0)]).nice().range([height, 0]);

    const xAxis = d3.axisBottom(x).ticks(Math.min(years.length, 10)).tickFormat(d3.format('d'));
    const yAxis = d3.axisLeft(y).ticks(6, 's');

    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
    g.append('g').call(yAxis);

    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(series.map(s => s.id));

    const line = d3.line()
        .defined(d => d.value !== null && d.value !== undefined)
        .x(d => x(d.year))
        .y(d => y(d.value));

    const s = g.selectAll('.series').data(series).enter().append('g').attr('class','series');

    s.append('path')
        .attr('class','line')
        .attr('d', d => line(d.values))
        .attr('fill','none')
        .attr('stroke', d => color(d.id))
        .attr('stroke-width', 2);

    // hide paths initially by applying stroke-dasharray / stroke-dashoffset
    s.selectAll('.line').each(function() {
        try {
            const path = this;
            const len = path.getTotalLength();
            d3.select(path).attr('stroke-dasharray', len).attr('stroke-dashoffset', len);
            // animate the stroke draw
            d3.select(path).transition().delay(120).duration(opts.duration || 1100).attr('stroke-dashoffset', 0);
        } catch (e) { /* some SVGs might not support getTotalLength */ }
    });

    // points
    const points = s.selectAll('.point').data(d => d.values.map(v => ({ id: d.id, year: v.year, value: v.value }))).enter()
        .append('circle')
        .attr('class','point')
        .attr('cx', d => x(d.year))
        .attr('cy', d => d.value !== null ? y(d.value) : -9999)
        .attr('r', 0)
        .attr('fill', d => color(d.id))
        .attr('opacity', 0.9);

    // animate points popping in
    points.transition().delay(300).duration(opts.duration || 600).attr('r', d => d.value !== null ? 3 : 0);

    // legend
    const legend = svg.append('g').attr('transform', `translate(${width + margin.left + 10}, ${margin.top})`);
    series.forEach((ser, i) => {
        const item = legend.append('g').attr('transform', `translate(0, ${i*20})`);
        item.append('rect').attr('width',12).attr('height',12).attr('fill', color(ser.id));
        item.append('text').attr('x',16).attr('y',10).style('font-size','12px').text(ser.id);
    });

    // interactive hover: vertical line + consolidated tooltip showing all series values for the hovered year
    let tooltip = d3.select('body').select('.tooltip');
    if (tooltip.empty()) tooltip = d3.select('body').append('div').attr('class','tooltip').style('opacity',0);

    const hoverLine = g.append('line').attr('class','hover-line').attr('y1',0).attr('y2',height).attr('stroke','#999').attr('stroke-width',1).attr('stroke-dasharray','3,3').style('opacity',0);

    // overlay to capture mouse events
    g.append('rect').attr('class','overlay').attr('width', width).attr('height', height).attr('fill','none').style('pointer-events','all')
        .on('mouseover', () => { hoverLine.style('opacity',1); tooltip.style('opacity',1); })
        .on('mouseout', () => { hoverLine.style('opacity',0); tooltip.style('opacity',0); })
        .on('mousemove', (event) => {
            const [mx, my] = d3.pointer(event, this);
            // invert to get approximate year value and pick nearest integer year from years array
            const xVal = x.invert(mx);
            // find nearest year
            let nearest = years[0];
            let minDiff = Math.abs(nearest - xVal);
            for (let i = 1; i < years.length; i++) {
                const diff = Math.abs(years[i] - xVal);
                if (diff < minDiff) { minDiff = diff; nearest = years[i]; }
            }
            const px = x(nearest);
            hoverLine.attr('x1', px).attr('x2', px);

            // Build list of values for this year across all series
            const items = series.map(s => {
                const v = s.values.find(vv => vv.year === nearest);
                return { id: s.id, value: v && v.value != null ? v.value : null, color: color(s.id) };
            }).sort((a,b) => (b.value || 0) - (a.value || 0));

            // build HTML for tooltip
            let html = `<div style="font-weight:bold;margin-bottom:6px">${nearest}</div>`;
            html += '<div style="max-height:240px;overflow:auto;">';
            items.forEach(it => {
                const display = it.value != null ? formatNumber(Math.round(it.value)) : '—';
                html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">`;
                html += `<div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:${it.color};display:inline-block;border-radius:2px"></span><span style="min-width:60px">${it.id}</span></div>`;
                html += `<div style="color:#fff;font-weight:600">${display}</div>`;
                html += `</div>`;
            });
            html += '</div>';

            tooltip.html(html).style('left', (event.pageX + 12) + 'px').style('top', (event.pageY + 12) + 'px').style('opacity', 1);
        });
}

    
