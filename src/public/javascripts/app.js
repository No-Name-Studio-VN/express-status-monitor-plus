'use strict';

import '../stylesheets/styles.css';
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip } from 'chart.js';
import 'chartjs-adapter-date-fns';
import zoomPlugin from 'chartjs-plugin-zoom';
import { io } from 'socket.io-client';

// Register Chart.js components (tree-shakeable)
Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip, zoomPlugin);

// ── Constants ──────────────────────────────────────────────────
const STATUS_COLORS = {
    '2xx': '#30d158',
    '3xx': '#5ac8fa',
    '4xx': '#ff9f0a',
    '5xx': '#ff453a',
};

// Per-chart accent colors (read from CSS custom properties)
const CHART_ACCENTS = {
    cpu: '--accent-cpu',
    mem: '--accent-mem',
    load: '--accent-load',
    heap: '--accent-heap',
    eventLoop: '--accent-eventloop',
    responseTime: '--accent-responsetime',
    rps: '--accent-rps',
};

const CHART_CONFIGS = {
    cpu: { label: 'CPU Usage', unit: '%', path: 'cpu', format: v => v.toFixed(1) + '%' },
    mem: { label: 'Memory Usage', unit: 'MB', path: 'memory', format: v => v.toFixed(1) + ' MB' },
    load: { label: 'Load Average', unit: '', path: 'load', format: v => Array.isArray(v) ? v[0].toFixed(2) : '--' },
    heap: { label: 'Heap Usage', unit: 'MB', path: 'heap', format: v => (v.used_heap_size / 1048576).toFixed(1) + ' MB' },
    eventLoop: { label: 'Event Loop', unit: 'ms', path: 'loop', format: v => v?.sum ?? 0 },
    responseTime: { label: 'Response Time', unit: 'ms', path: 'mean', format: v => v.toFixed(2) + ' ms', source: 'responses' },
    rps: { label: 'Requests/Second', unit: '', path: 'count', format: v => v.toFixed(2), source: 'responses' },
};

// ── Time formatter using Intl ──────────────────────────────────
const fullFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

// ── Detect if dark mode is active ──────────────────────────────
function isDarkMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── Chart theme colors ─────────────────────────────────────────
function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartColors() {
    const dark = isDarkMode();
    return {
        grid: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
        text: dark ? '#98989d' : '#6e6e73',
        tick: dark ? '#6e6e73' : '#86868b',
    };
}

function getAccentColor(chartId) {
    const cssVar = CHART_ACCENTS[chartId];
    if (cssVar) {
        const val = getCSSVar(cssVar);
        if (val) return val;
    }
    return isDarkMode() ? '#0a84ff' : '#007aff';
}

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Create chart options ───────────────────────────────────────
function createChartOptions() {
    const colors = getChartColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300, easing: 'easeOutQuart' },
        interaction: { mode: 'nearest', intersect: false },
        scales: {
            x: {
                type: 'time',
                display: true,
                grid: { color: colors.grid, drawBorder: false },
                ticks: {
                    color: colors.tick,
                    font: { size: 10, family: 'var(--font-mono)' },
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 8,
                },
                border: { display: false },
            },
            y: {
                display: true,
                grid: { color: colors.grid, drawBorder: false },
                ticks: {
                    color: colors.tick,
                    font: { size: 10, family: 'var(--font-mono)' },
                    padding: 8,
                },
                border: { display: false },
                beginAtZero: true,
            },
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: isDarkMode() ? '#2c2c2e' : '#ffffff',
                titleColor: isDarkMode() ? '#f5f5f7' : '#1d1d1f',
                bodyColor: isDarkMode() ? '#98989d' : '#6e6e73',
                borderColor: isDarkMode() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 10,
                titleFont: { size: 12, weight: '600' },
                bodyFont: { size: 11 },
                displayColors: false,
            },
            zoom: {
                pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                zoom: {
                    mode: 'x',
                    wheel: { enabled: true, speed: 0.05 },
                    drag: { enabled: true, backgroundColor: isDarkMode() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                },
            },
        },
        elements: {
            line: {
                borderWidth: 2,
                tension: 0.3,
                fill: true,
            },
            point: {
                radius: 0,
                hoverRadius: 4,
                hoverBorderWidth: 2,
            },
        },
    };
}

// ── Main Dashboard Class ──────────────────────────────────────
class Dashboard {
    constructor() {
        this.charts = new Map();

        this.initSocket();
        this.initCharts();
        this.initScrollBehavior();
        this.initThemeListener();
        this.initLayoutToggle();
    }

    // ── Socket.io ──────────────────────────────────────────────
    initSocket() {
        const loc = window.location;
        this.socket = io(`${loc.protocol}//${loc.hostname}:${port || loc.port}`, {
            path: socketPath,
            transports: ['websocket'],
        });

        this.socket.on('esm_start', data => this.handleStart(data));
        this.socket.on('esm_stats', data => this.handleStats(data));
        this.socket.on('connect', () => this.setConnectionStatus(true));
        this.socket.on('disconnect', () => this.setConnectionStatus(false));
    }

    setConnectionStatus(connected) {
        const dot = document.getElementById('statusDot');
        if (dot) {
            dot.style.background = connected ? 'var(--color-green)' : 'var(--color-red)';
            dot.style.animationPlayState = connected ? 'running' : 'paused';
        }
    }

    // ── Chart initialization ───────────────────────────────────
    initCharts() {
        for (const [id, config] of Object.entries(CHART_CONFIGS)) {
            const canvas = document.getElementById(`${id}Chart`);
            if (!canvas) continue;

            const accent = getAccentColor(id);

            const datasets = id === 'statusCodes'
                ? Object.entries(STATUS_COLORS).map(([label, color]) => ({
                    label,
                    data: [],
                    borderColor: color,
                    backgroundColor: hexToRgba(color, 0.08),
                    tension: 0.35,
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 1.5,
                }))
                : [{
                    label: config.label,
                    data: [],
                    borderColor: accent,
                    backgroundColor: hexToRgba(accent, 0.08),
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 1.5,
                }];

            const chart = new Chart(canvas, {
                type: 'line',
                data: { labels: [], datasets },
                options: createChartOptions(),
            });

            // ── Inject toolbar into chart header ─────────────
            const header = canvas.closest('.chart-card')?.querySelector('.chart-card-header');
            if (header) {
                const toolbar = document.createElement('div');
                toolbar.className = 'chart-toolbar';
                toolbar.innerHTML = `
                    <button class="chart-toolbar-btn reset-zoom" title="Reset zoom" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>
                        Reset
                    </button>
                    <button class="chart-toolbar-btn" data-action="zoom-in" title="Zoom in" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"/></svg>
                    </button>
                    <button class="chart-toolbar-btn" data-action="zoom-out" title="Zoom out" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"/></svg>
                    </button>
                    <button class="chart-toolbar-btn" data-action="download" title="Download PNG" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                    </button>
                `;

                // Insert toolbar before the stat element
                const stat = header.querySelector('.chart-card-stat');
                header.insertBefore(toolbar, stat);

                const resetBtn = toolbar.querySelector('.reset-zoom');

                // Wire up toolbar buttons
                toolbar.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-action]');
                    if (!btn) {
                        // Reset zoom button (no data-action)
                        if (e.target.closest('.reset-zoom')) {
                            chart.resetZoom();
                            resetBtn.classList.remove('visible');
                        }
                        return;
                    }

                    switch (btn.dataset.action) {
                        case 'zoom-in':
                            chart.zoom(1.2);
                            resetBtn.classList.add('visible');
                            break;
                        case 'zoom-out':
                            chart.zoom(0.8);
                            resetBtn.classList.add('visible');
                            break;
                        case 'download': {
                            const link = document.createElement('a');
                            link.href = chart.toBase64Image();
                            link.download = `${id}-chart.png`;
                            link.click();
                            break;
                        }
                    }
                });

                // Show reset button when user drag-zooms or scroll-zooms
                chart.options.plugins.zoom.zoom.onZoomComplete = () => {
                    resetBtn.classList.add('visible');
                };
            }

            this.charts.set(id, {
                chart,
                stat: document.getElementById(`${id}Stat`),
                config,
            });
        }
    }

    // ── Scroll behavior ────────────────────────────────────────
    initScrollBehavior() {
        const scrollBtn = document.getElementById('scrollTopBtn');
        const header = document.getElementById('appHeader');
        let lastScroll = 0;
        let ticking = false;

        const onScroll = () => {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(() => {
                const currentScroll = window.scrollY;

                // Header hide/show
                if (header) {
                    header.classList.toggle('header-hidden', currentScroll > 60 && currentScroll > lastScroll);
                }

                // Scroll-to-top button
                if (scrollBtn) {
                    scrollBtn.classList.toggle('visible', currentScroll > 300);
                }

                lastScroll = currentScroll;
                ticking = false;
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });

        scrollBtn?.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ── Theme toggle ───────────────────────────────────────────
    initThemeListener() {
        const toggleBtn = document.getElementById('themeToggleBtn');
        const dropdown = document.getElementById('themeDropdown');
        const backdrop = document.getElementById('themeBackdrop');
        const items = dropdown?.querySelectorAll('.theme-dropdown-item');

        // Restore saved theme preference
        const saved = localStorage.getItem('esm-theme');
        if (saved && ['light', 'dark', 'auto'].includes(saved)) {
            this.applyTheme(saved);
        } else {
            this.applyTheme(document.documentElement.getAttribute('data-theme') || 'auto');
        }

        // Toggle dropdown
        const openDropdown = () => {
            dropdown?.classList.add('open');
            backdrop?.classList.add('open');
        };
        const closeDropdown = () => {
            dropdown?.classList.remove('open');
            backdrop?.classList.remove('open');
        };

        toggleBtn?.addEventListener('click', () => {
            dropdown?.classList.contains('open') ? closeDropdown() : openDropdown();
        });
        backdrop?.addEventListener('click', closeDropdown);

        // Theme selection
        items?.forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.themeValue;
                this.applyTheme(value);
                localStorage.setItem('esm-theme', value);
                closeDropdown();
            });
        });

        // Listen for OS theme changes (matters when theme is 'auto')
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            this.refreshChartTheme();
            this.updateThemeIcon();
        });
    }

    applyTheme(value) {
        document.documentElement.setAttribute('data-theme', value);
        this.updateThemeIcon();
        this.updateThemeDropdownActive(value);
        this.refreshChartTheme();
    }

    // ── Layout toggle ──────────────────────────────────────────
    initLayoutToggle() {
        const container = document.getElementById('layoutToggle');
        if (!container) return;

        const buttons = container.querySelectorAll('.layout-btn');
        const saved = localStorage.getItem('esm-layout') || '2';

        // Apply saved layout
        this.applyLayout(saved, buttons);

        // Wire click handlers
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const cols = btn.dataset.cols;
                this.applyLayout(cols, buttons);
                localStorage.setItem('esm-layout', cols);
            });
        });
    }

    applyLayout(cols, buttons) {
        // Update button active state
        buttons.forEach(b => b.classList.toggle('active', b.dataset.cols === cols));

        // Update body class
        document.body.classList.remove('layout-2', 'layout-3', 'layout-4');
        if (cols !== '2') {
            document.body.classList.add(`layout-${cols}`);
        }

        // Trigger chart resize after layout transition
        requestAnimationFrame(() => {
            for (const { chart } of this.charts.values()) {
                chart.resize();
            }
        });
    }

    updateThemeIcon() {
        const sun = document.getElementById('themeIconSun');
        const moon = document.getElementById('themeIconMoon');
        const auto = document.getElementById('themeIconAuto');
        if (!sun || !moon || !auto) return;

        const theme = document.documentElement.getAttribute('data-theme');
        sun.style.display = 'none';
        moon.style.display = 'none';
        auto.style.display = 'none';

        if (theme === 'light') {
            sun.style.display = 'block';
        } else if (theme === 'dark') {
            moon.style.display = 'block';
        } else {
            auto.style.display = 'block';
        }
    }

    updateThemeDropdownActive(value) {
        const items = document.querySelectorAll('.theme-dropdown-item');
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.themeValue === value);
        });
    }

    refreshChartTheme() {
        for (const { chart } of this.charts.values()) {
            chart.options = createChartOptions();
            chart.update('none');
        }
    }

    // ── Data handlers ──────────────────────────────────────────
    handleStart(data) {
        this.updateTime();

        if (!data) return;

        // data is a single span object: { os: [], responses: [], interval }
        // Remove last incomplete data points
        if (data.responses?.length) data.responses.pop();
        if (data.os?.length) data.os.pop();

        this.populateInitialData(data);
    }

    handleStats(data) {
        if (!data) return;

        this.updateTime();
        this.updateFromStats(data);
    }

    updateTime() {
        const el = document.getElementById('currentTime');
        if (el) el.textContent = fullFormatter.format(new Date());
    }

    // ── Populate initial chart data ────────────────────────────
    populateInitialData(spanData) {
        // Clear existing data
        for (const { chart } of this.charts.values()) {
            chart.data.labels = [];
            chart.data.datasets.forEach(ds => { ds.data = []; });
        }

        // Populate OS metrics
        if (spanData.os) {
            spanData.os.forEach(point => {
                const ts = point.timestamp;
                for (const [id, config] of Object.entries(CHART_CONFIGS)) {
                    if (config.source === 'responses') continue;
                    this.pushChartPoint(id, this.extractValue(point, config), ts);
                }

                // Update system info from first point
                if (point.systemInfo) {
                    this.updateSystemInfo(point.systemInfo);
                }
            });
        }

        // Populate response metrics
        if (spanData.responses) {
            spanData.responses.forEach(point => {
                const ts = point.timestamp;
                this.pushChartPoint('responseTime', point.mean, ts);
                this.pushChartPoint('rps', point.count, ts);

                // Status codes
                const statusChart = this.charts.get('statusCodes');
                if (statusChart) {
                    for (let i = 0; i < 4; i++) {
                        statusChart.chart.data.datasets[i].data.push(point[i + 2] || 0);
                    }
                    statusChart.chart.data.labels.push(ts);
                }
            });
        }

        // Update all charts and summary
        for (const { chart } of this.charts.values()) {
            chart.update('none');
        }

        this.updateSummaryFromLatest(spanData);
    }

    // ── Update from real-time stats ────────────────────────────
    updateFromStats(data) {
        const ts = data.timestamp ?? Date.now();

        // OS metrics
        if (data.os) {
            for (const [id, config] of Object.entries(CHART_CONFIGS)) {
                if (config.source === 'responses') continue;
                const value = this.extractValue(data.os, config);
                this.pushChartPoint(id, value, ts);
                this.updateChartStat(id, value);
            }

            // Update summary cards
            this.updateSummaryCard('cpu', data.os.cpu?.toFixed(1) + '%');
            this.updateSummaryCard('mem', data.os.memory?.toFixed(1) + ' MB');
            if (data.os.heap) {
                this.updateSummaryCard('heap', (data.os.heap.used_heap_size / 1048576).toFixed(1) + ' MB');
            }
            if (data.os.load) {
                this.updateSummaryCard('load', data.os.load[0]?.toFixed(2));
                const sub = document.getElementById('loadSub');
                if (sub && data.os.load.length >= 3) {
                    sub.textContent = `5m: ${data.os.load[1]?.toFixed(2)}  15m: ${data.os.load[2]?.toFixed(2)}`;
                }
            }

            // Memory breakdown sub
            if (data.os.memoryBreakdown) {
                const mb = data.os.memoryBreakdown;
                const memSub = document.getElementById('memSub');
                if (memSub) {
                    memSub.textContent = `RSS: ${mb.rss.toFixed(1)} MB / Ext: ${mb.external.toFixed(1)} MB`;
                }
                const heapSub = document.getElementById('heapSub');
                if (heapSub) {
                    heapSub.textContent = `Total: ${mb.heapTotal.toFixed(1)} MB`;
                }
            }

            // System info
            if (data.os.systemInfo) {
                this.updateSystemInfo(data.os.systemInfo);
            }
        }

        // Response metrics
        if (data.responses) {
            this.pushChartPoint('responseTime', data.responses.mean, ts);
            this.pushChartPoint('rps', data.responses.count, ts);
            this.updateChartStat('responseTime', data.responses.mean);
            this.updateChartStat('rps', data.responses.count);

            this.updateSummaryCard('rps', data.responses.count?.toFixed(2));

            // Status codes
            const statusChart = this.charts.get('statusCodes');
            if (statusChart) {
                for (let i = 0; i < 4; i++) {
                    statusChart.chart.data.datasets[i].data.push(data.responses[i + 2] || 0);
                }
                statusChart.chart.data.labels.push(ts);

                // Status codes stat: total requests
                const total = (data.responses[2] || 0) + (data.responses[3] || 0) + (data.responses[4] || 0) + (data.responses[5] || 0);
                if (statusChart.stat) statusChart.stat.textContent = total;
            }
        }

        // Percentiles
        if (data.percentiles) {
            this.updatePercentile('p50', data.percentiles.p50);
            this.updatePercentile('p95', data.percentiles.p95);
            this.updatePercentile('p99', data.percentiles.p99);
        }

        // Update all charts (no trimming — infinite retention)
        for (const { chart } of this.charts.values()) {
            chart.update('none');
        }
    }

    // ── Helpers ────────────────────────────────────────────────
    extractValue(data, config) {
        if (!config.path || !data) return undefined;
        return config.path.split('.').reduce((obj, key) => obj?.[key], data);
    }

    pushChartPoint(id, value, timestamp) {
        const chartData = this.charts.get(id);
        if (!chartData || value === undefined || value === null) return;
        chartData.chart.data.datasets[0].data.push(
            Array.isArray(value) ? value[0] : (typeof value === 'object' && value.used_heap_size ? value.used_heap_size / 1048576 : value)
        );
        chartData.chart.data.labels.push(timestamp);
    }

    updateChartStat(id, value) {
        const chartData = this.charts.get(id);
        if (!chartData?.stat || value === undefined) return;
        const config = CHART_CONFIGS[id];
        if (config?.format) {
            chartData.stat.textContent = config.format(value);
        }
    }

    updateSummaryCard(metric, value) {
        const el = document.getElementById(`${metric}Summary`);
        if (el && value !== undefined) {
            // Animate value change
            el.classList.add('updating');
            el.textContent = value;
            setTimeout(() => el.classList.remove('updating'), 150);
        }
    }

    updatePercentile(id, value) {
        const el = document.getElementById(`${id}Value`);
        if (el && value !== undefined) {
            el.textContent = typeof value === 'number' ? value.toFixed(2) : '--';
        }
    }

    updateSystemInfo(info) {
        if (!info) return;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.textContent = val;
        };

        set('sysNodeVersion', info.nodeVersion);
        set('sysPlatform', info.platform);
        set('sysPid', info.pid);
        set('sysCpuCount', info.cpuCount);

        if (info.uptime !== undefined) {
            const h = Math.floor(info.uptime / 3600);
            const m = Math.floor((info.uptime % 3600) / 60);
            const s = Math.floor(info.uptime % 60);
            set('sysUptime', `${h}h ${m}m ${s}s`);
        }
    }

    updateSummaryFromLatest(spanData) {
        if (spanData.os?.length) {
            const lastOs = spanData.os[spanData.os.length - 1];
            if (lastOs) {
                this.updateSummaryCard('cpu', lastOs.cpu?.toFixed(1) + '%');
                this.updateSummaryCard('mem', lastOs.memory?.toFixed(1) + ' MB');
                if (lastOs.heap) {
                    this.updateSummaryCard('heap', (lastOs.heap.used_heap_size / 1048576).toFixed(1) + ' MB');
                }
                if (lastOs.load) {
                    this.updateSummaryCard('load', lastOs.load[0]?.toFixed(2));
                }
                if (lastOs.systemInfo) {
                    this.updateSystemInfo(lastOs.systemInfo);
                }
            }
        }
        if (spanData.responses?.length) {
            const lastResp = spanData.responses[spanData.responses.length - 1];
            if (lastResp) {
                this.updateSummaryCard('rps', lastResp.count?.toFixed(2));
            }
        }
    }
}

// ── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});