/* eslint-disable complexity */

import UPlot, {
    Options as UPlotOptions,
    AlignedData as UPlotData,
    Plugin,
    Series,
    DrawOrderKey,
    SyncPubSub,
} from 'uplot';

import LegendPlugin from './plugins/legend/legend';
import tooltipPlugin, {TooltipPlugin} from './plugins/tooltip/tooltip';
import markersPlugin from './plugins/markers';
import cursorPlugin from './plugins/cursor/cursor';
import plotLinesPlugin, {PlotLinesPlugin} from './plugins/plotLines/plotLines';

import {
    YagrConfig,
    RawSerieData,
    PlotLineConfig,
    YagrHooks,
    DataSeries,
    MinimalValidConfig,
    YagrTheme,
    HookParams,
} from './types';

import {assignKeys, debounce, genId, getSumByIdx, preprocess} from './utils/common';
import {configureAxes, getRedrawOptionsForAxesUpdate, updateAxis} from './utils/axes';
import {getPaddingByAxes} from './utils/chart';
import ColorParser from './utils/colors';
import {configureSeries, UPDATE_KEYS} from './utils/series';

import ThemedDefaults, {
    DEFAULT_X_SCALE,
    DEFAULT_X_SERIE_NAME,
    MIN_SELECTION_WIDTH,
    DEFAULT_FOCUS_ALPHA,
    DEFAULT_CANVAS_PIXEL_RATIO,
    DEFAULT_Y_SCALE,
    DEFAULT_SYNC_KEY,
    DEFAULT_TITLE_FONT_SIZE,
} from './defaults';
import i18n from './locale';
import {configureScales} from './utils/scales';

export interface YagrEvent {
    chart: Yagr;
    meta: YagrMeta;
}

export type YagrMeta = {
    renderTime: number;
    processTime: number;
    initTime: number;
};

type CachedProps = {
    width: number;
    height: number;
};

export interface YagrState {
    isMouseOver: boolean;
    stage: 'config' | 'processing' | 'uplot' | 'render' | 'listen';
    inBatch?: boolean;
}

export interface UpdateOptions {
    incremental?: boolean;
    splice?: boolean;
}

/*
 * Main core-module of Yagr.
 * Implements data processing and autoconfigurable wrapper
 * for uPlot chart.
 * Entrypoint of every Yagr chart.
 */
class Yagr<TConfig extends MinimalValidConfig = MinimalValidConfig> {
    id!: string;
    options!: UPlotOptions;
    uplot!: UPlot;
    root!: HTMLElement;
    series!: UPlotData;
    config!: YagrConfig;
    resizeOb?: ResizeObserver;
    canvas!: HTMLCanvasElement;
    plugins!: {
        tooltip?: ReturnType<TooltipPlugin>;
        plotLines?: ReturnType<PlotLinesPlugin>;
        cursor?: ReturnType<typeof cursorPlugin>;
        legend?: LegendPlugin;
    } & (TConfig['plugins'] extends YagrConfig['plugins']
        ? {[key in keyof TConfig['plugins']]: ReturnType<TConfig['plugins'][key]>}
        : {});
    state!: YagrState;
    utils!: {
        colors: ColorParser;
        sync?: SyncPubSub;
        theme: ThemedDefaults;
        i18n: ReturnType<typeof i18n>;
    };

    get isEmpty() {
        return this._isEmptyDataSet;
    }

    private _startTime!: number;
    private _meta: Partial<YagrMeta> = {};
    private _cache!: CachedProps;
    private _isEmptyDataSet = false;
    private _y2uIdx: Record<string, number> = {};
    private _batch: {fns: Function[]; recalc?: boolean} = {fns: []};

    constructor(root: HTMLElement, pConfig: TConfig) {
        this._startTime = performance.now();
        this.state = {
            isMouseOver: false,
            stage: 'config',
        };

        const config: YagrConfig = Object.assign(
            {
                title: {},
                data: [],
                axes: {},
                series: [],
                scales: {},
                hooks: {},
                settings: {},
                chart: {},
                cursor: {},
                plugins: {},
                legend: {
                    show: false,
                },
                tooltip: {
                    show: true,
                },
                grid: null,
                markers: {},
            },
            pConfig,
        );

        this.config = config;

        this.inStage('config', () => {
            this.id = root.id || genId();
            this.root = root;
            this.root.classList.add('yagr');

            const colorParser = new ColorParser();
            const sync = this.config.cursor.sync;

            const chart = this.config.chart;

            chart.series ||= {type: 'line'};
            chart.size ||= {adaptive: true};
            chart.appereance ||= {locale: 'en'};
            chart.select ||= {};

            this.utils = {
                colors: colorParser,
                i18n: i18n(config.chart.appereance?.locale || 'en'),
                theme: new ThemedDefaults(colorParser),
            };

            colorParser.setContext(root);

            if (sync) {
                this.utils.sync = UPlot.sync(typeof sync === 'string' ? sync : DEFAULT_SYNC_KEY);
            }

            if (!chart.size.adaptive && chart.size.width && chart.size.height) {
                root.style.width = chart.size.width + 'px';
                root.style.height = chart.size.height + 'px';
            }

            this.setTheme(chart.appereance.theme || 'light');

            const options = this.createUplotOptions();
            this._cache = {height: options.height, width: options.width};
            this.options = config.editUplotOptions ? config.editUplotOptions(options) : options;
            this.plugins.legend = new LegendPlugin(this, config.legend);
        })
            .inStage('processing', () => {
                const series = this.transformSeries();
                this.series = series;
            })
            .inStage('uplot', () => {
                this.uplot = new UPlot(this.options, this.series, this.initRender);
                this.canvas = root.querySelector('canvas') as HTMLCanvasElement;

                this.init();

                const processTime = performance.now() - this._startTime;
                this._meta.processTime = processTime;

                this.execHooks(config.hooks.processed, {
                    chart: this,
                    meta: {
                        processTime,
                    },
                });
            })
            .inStage('render');
    }

    /*
     * Set's locale of chart and redraws all locale-dependent elements.
     */
    setLocale(locale: string | Record<string, string>) {
        this.wrapBatch(() => () => {
            this.utils.i18n = i18n(locale);
            this.plugins.legend?.redraw();
        });
    }

    /**
     *  Set's theme of chart and redraws all theme-dependent elements.
     */
    setTheme(themeValue: YagrTheme) {
        this.utils.theme.setTheme(themeValue);
        this.root.classList.remove('yagr_theme_dark');
        this.root.classList.remove('yagr_theme_light');
        this.root.classList.add('yagr_theme_' + themeValue);

        if (!this.uplot) {
            return;
        }

        this.wrapBatch(() => () => this.redraw(false, true));
    }

    /**
     * Redraws Yagr instance by given options.
     */
    redraw(series = true, axes = true) {
        this.uplot.redraw(series, axes);
    }

    /**
     *  Get uPlot's Series from series id
     */
    getSeriesById(id: string): Series {
        return this.uplot.series[this._y2uIdx[id]];
    }

    setVisible(lineId: string | null, show: boolean) {
        const seriesIdx = lineId === null ? null : this._y2uIdx[lineId];
        const fns: Function[] = [];

        if (seriesIdx === null) {
            fns.push(() => {
                /**
                 * @TODO Fix after bug in uPlot will be fixed
                 * @see https://github.com/leeoniya/uPlot/issues/680
                 */
                this.uplot.series.forEach((_, i) => {
                    i && this.uplot.setSeries(i, {show});
                });
            });
        } else {
            fns.push(() => {
                this.uplot.setSeries(seriesIdx, {
                    show,
                });
            });
        }

        this.options.series = this.uplot.series;

        let shouldRebuildStacks = false;

        if (seriesIdx) {
            const series = this.uplot.series[seriesIdx];
            const scaleName = series.scale || DEFAULT_Y_SCALE;
            const scale = this.config.scales[scaleName];
            shouldRebuildStacks = Boolean(scale && scale.stacking);
        } else {
            shouldRebuildStacks = this.options.series.reduce((acc, {scale}) => {
                return Boolean((scale && this.config.scales[scale]?.stacking) || acc);
            }, false as boolean);
        }

        return this.wrapBatch(() => [fns, shouldRebuildStacks]);
    }

    setFocus(lineId: string | null, focus: boolean) {
        this.wrapBatch(() => () => {
            const seriesIdx = lineId === null ? null : this._y2uIdx[lineId];
            this.plugins.cursor?.focus(seriesIdx, focus);
            this.uplot.setSeries(seriesIdx, {focus});
        });
    }

    dispose() {
        this.resizeOb && this.resizeOb.unobserve(this.root);
        this.unsubscribe();
        this.uplot.destroy();
        this.execHooks(this.config.hooks.dispose, {chart: this});
    }

    toDataUrl() {
        return this.canvas.toDataURL('img/png');
    }

    subscribe() {
        this.utils.sync?.sub(this.uplot);
    }

    unsubscribe() {
        this.utils.sync?.unsub(this.uplot);
    }

    batch(fn: () => void) {
        this.state.inBatch = true;
        fn();
        this.uplot.batch(() => {
            this._batch.fns.forEach((f) => f());
            if (this._batch.recalc) {
                this.series = this.transformSeries();
                this.uplot.setData(this.series, true);
            }
        });
        this._batch = {fns: [], recalc: false};
        this.state.inBatch = false;
    }

    setAxes(axes: YagrConfig['axes']) {
        const {x, ...rest} = axes;

        if (x) {
            const xAxis = this.uplot.axes.find(({scale}) => scale === DEFAULT_X_SCALE);

            if (xAxis) {
                updateAxis(this, xAxis, {scale: DEFAULT_X_SCALE, ...x});
            }
        }

        Object.entries(rest).forEach(([scaleName, scaleConfig]) => {
            const axis = this.uplot.axes.find(({scale}) => scale === scaleName);

            if (axis) {
                updateAxis(this, axis, {scale: scaleName, ...scaleConfig});
            }
        });

        this.redraw(...getRedrawOptionsForAxesUpdate(axes));
    }

    /** Incremental false */
    setSeries(seriesId: string, series: Partial<RawSerieData>): void;
    setSeries(seriesIdx: number, series: Partial<RawSerieData>): void;
    setSeries(series: Partial<RawSerieData>[]): void;
    /** Incremental depends on setting */
    setSeries(timeline: number[], series: Partial<RawSerieData>[], options: UpdateOptions): void;
    setSeries(
        timelineOrSeriesOrId: Partial<RawSerieData>[] | number[] | number | string,
        maybeSeries?: Partial<RawSerieData>[] | Partial<RawSerieData>,
        options: UpdateOptions = {
            incremental: true,
            splice: false,
        },
    ) {
        this.wrapBatch(() => {
            return this._setSeries(timelineOrSeriesOrId, maybeSeries, options);
        });
    }

    /*
     * Main config processing options
     * Configures options, axess, grids, scales etc
     */
    private createUplotOptions() {
        const {config} = this;
        const plugins: Plugin[] = [];

        // @ts-ignore
        this.plugins = {};
        Object.entries(config.plugins).forEach(([name, plugin]) => {
            const pluginInstance = plugin(this);
            plugins.push(pluginInstance.uplot);
            Object.assign(this.plugins, {[name]: pluginInstance});
        });

        const chart = config.chart;

        /** Setting up TooltipPugin */
        if (config.tooltip && config.tooltip.show !== false) {
            const tooltipPluginInstance = tooltipPlugin(this, config.tooltip);
            plugins.push(tooltipPluginInstance.uplot);
            this.plugins.tooltip = tooltipPluginInstance;
        }

        const options: UPlotOptions = {
            width: this.root.clientWidth,
            height: this.clientHeight,
            title: config.title?.text,
            plugins: plugins,
            focus: {alpha: DEFAULT_FOCUS_ALPHA},
            series: [
                {
                    id: DEFAULT_X_SERIE_NAME,
                    $c: config.timeline,
                    scale: DEFAULT_X_SCALE,
                    count: config.timeline.length,
                } as Series,
            ],
            ms: chart.timeMultiplier || 1,
            hooks: config.hooks || {},
        };

        this._isEmptyDataSet =
            config.timeline.length === 0 ||
            config.series.length === 0 ||
            config.series.every(({data}) => data.length === 0);

        /**
         * Setting up cursor - points on cursor, drag behavior, crosshairs
         */
        options.cursor = options.cursor || {};
        options.cursor.points = options.cursor.points || {};
        options.cursor.drag = options.cursor.drag || {
            dist: chart.select?.minWidth || MIN_SELECTION_WIDTH,
            x: true,
            y: false,
            setScale: chart.select?.zoom ?? true,
        };

        if (this.utils.sync) {
            options.cursor.sync = options.cursor.sync || {
                key: this.utils.sync.key,
            };
        }

        if (config.cursor) {
            const cPlugin = cursorPlugin(this, config.cursor);
            this.plugins.cursor = cPlugin;
            plugins.push(cPlugin.uplot);
        }

        const seriesOptions = config.series || [];
        const resultingSeriesOptions: Series[] = options.series;

        /**
         * Prepare series options
         */
        for (let i = seriesOptions.length - 1; i >= 0; i--) {
            const serie = configureSeries(this, seriesOptions[i] || {}, i);
            const uIdx = resultingSeriesOptions.push(serie);
            this._y2uIdx[serie.id || i] = uIdx - 1;
        }

        /** Setting up markers plugin after default points renderers to be settled */
        const markersPluginInstance = markersPlugin(this, config);
        plugins.push(markersPluginInstance);

        options.series = resultingSeriesOptions;

        if (!config.scales || Object.keys(config.scales).length === 0) {
            config.scales = {
                x: {},
                y: {},
            };
        }

        /** Setting up scales */
        options.scales = options.scales || {};
        options.scales = configureScales(this, options.scales, config);

        /** Setting up minimal axes */
        options.axes = options.axes || [];
        const axes = options.axes;

        axes.push(...configureAxes(this, config));

        const plotLinesPluginInstance = this.initPlotLinesPlugin(config);
        this.plugins.plotLines = plotLinesPluginInstance;
        plugins.push(plotLinesPluginInstance.uplot);

        /** Setting up hooks */
        options.hooks = config.hooks || {};
        options.hooks.draw = options.hooks.draw || [];
        options.hooks.draw.push(() => {
            if (this.state.stage === 'listen') {
                return;
            }
            this.state.stage = 'listen';
            this.execHooks(this.config.hooks.stage, {chart: this, stage: this.state.stage});
            const renderTime = performance.now() - this._startTime;
            this._meta.renderTime = renderTime;
            this.execHooks(config.hooks.load, {
                chart: this,
                meta: this._meta as YagrMeta,
            });
        });

        options.hooks.ready = options.hooks.ready || [];
        options.hooks.ready.push(() => {
            const initTime = performance.now() - this._startTime;
            this._meta.initTime = initTime;
            this.execHooks(config.hooks.inited, {
                chart: this,
                meta: {
                    initTime,
                },
            });
        });

        options.hooks.drawClear = options.hooks.drawClear || [];
        options.hooks.drawClear.push((u: UPlot) => {
            const {ctx} = u;
            ctx.save();
            ctx.fillStyle = this.utils.theme.BACKGROUND;
            ctx.fillRect(
                DEFAULT_CANVAS_PIXEL_RATIO,
                DEFAULT_CANVAS_PIXEL_RATIO,
                u.width * DEFAULT_CANVAS_PIXEL_RATIO - 2 * DEFAULT_CANVAS_PIXEL_RATIO,
                u.height * DEFAULT_CANVAS_PIXEL_RATIO - 2 * DEFAULT_CANVAS_PIXEL_RATIO,
            );
            ctx.restore();
        });

        options.hooks.setSelect = options.hooks.setSelect || [];
        options.hooks.setSelect.push((u: UPlot) => {
            const {left, width} = u.select;
            const [_from, _to] = [u.posToVal(left, DEFAULT_X_SCALE), u.posToVal(left + width, DEFAULT_X_SCALE)];
            const {timeMultiplier = 1} = chart;

            this.execHooks(config.hooks.onSelect, {
                from: Math.ceil(_from / timeMultiplier),
                to: Math.ceil(_to / timeMultiplier),
                chart: this,
            });

            u.setSelect({width: 0, height: 0, top: 0, left: 0}, false);
        });

        options.drawOrder = chart.appereance?.drawOrder
            ? (chart.appereance?.drawOrder.filter(
                  (key) => key === DrawOrderKey.Series || key === DrawOrderKey.Axes,
              ) as DrawOrderKey[])
            : [DrawOrderKey.Series, DrawOrderKey.Axes];

        /** Disabling uPlot legend. */
        options.legend = {show: false};
        options.padding = config.chart.size?.padding || getPaddingByAxes(options);

        this.options = options;

        return options;
    }

    /*
     * Main data processing function
     * Transforms series values
     */
    // eslint-disable-next-line complexity
    private transformSeries() {
        const result = [];
        const config = this.config;
        const timeline = config.timeline;
        let processing = config.processing || false;

        let series: DataSeries[] = this.config.series.map(({data}) => data) as DataSeries[];

        if (processing && processing.interpolation) {
            series = preprocess(series, timeline, processing);
            processing = false;
        }

        const shouldMapNullValues = Boolean(processing && processing.nullValues);
        const nullValues = (processing && processing.nullValues) || {};

        /**
         * Stacks are represented as:
         * {
         *    [scale]: {
         *        [],  // stacking group idx 0 (default for all on scale),
         *        [],  // stacking group idx 1
         *    ]
         * }
         *
         * All stacked points are accumulating inside of series' scale group
         */
        const stacks: Record<string, number[][]> = {};

        for (let sIdx = 0; sIdx < series.length; sIdx++) {
            const dataLine: (number | null)[] = [];
            const realSerieIdx = sIdx + 1;
            const serie = series[sIdx];

            const serieConfigIndex = this.options.series.length - realSerieIdx;
            const serieOptions = this.options.series[serieConfigIndex];
            const scale = serieOptions.scale || DEFAULT_Y_SCALE;
            const scaleConfig = this.config.scales[scale] || {};
            const isStacking = scaleConfig.stacking;
            const sGroup = serieOptions.stackGroup || 0;

            let empty = true;

            if (isStacking && !stacks[scale]) {
                this.options.focus = this.options.focus || {alpha: 1.1};
                this.options.focus.alpha = 1.1;
                stacks[scale] = [];
            }

            if (isStacking && !stacks[scale][sGroup]) {
                stacks[scale][sGroup] = new Array(timeline.length).fill(0);
            }

            serieOptions.count = 0;

            for (let idx = 0; idx < serie.length; idx++) {
                let value = serie[idx];

                if (shouldMapNullValues && nullValues[String(value)]) {
                    value = null;
                }

                if (serieOptions.transform) {
                    serieOptions._transformed = true;
                    value = serieOptions.transform(value, series, idx);
                }

                if (scaleConfig.transform) {
                    serieOptions._transformed = true;
                    value = scaleConfig.transform(value, series, idx);
                }

                if (value === null) {
                    if (serieOptions.type === 'line' || serieOptions.type === 'dots') {
                        dataLine.push(null);
                        continue;
                    } else {
                        value = 0;
                    }
                }

                empty = false;

                if (scaleConfig.normalize) {
                    const sum = getSumByIdx(series, this.options.series, idx, scale);
                    value = sum && (value / sum) * (scaleConfig.normalizeBase || 100);

                    serieOptions.normalizedData = serieOptions.normalizedData || [];
                    serieOptions.normalizedData[idx] = value;
                }

                if (scaleConfig.stacking) {
                    if (serieOptions.show === false) {
                        value = 0;
                    }

                    value = stacks[scale][sGroup][idx] += value;
                }

                if (scaleConfig.type === 'logarithmic' && value === 0) {
                    value = 1;
                }

                serieOptions.sum = (serieOptions.sum || 0) + (value || 0);

                serieOptions.count += 1;
                dataLine.push(value);
            }

            serieOptions.avg = (serieOptions.sum || 0) / serieOptions.count;

            serieOptions.empty = empty;
            result.unshift(dataLine);
        }

        result.unshift(this.config.timeline);
        return result as UPlotData;
    }

    private onError(error: Error) {
        this.execHooks(this.config.hooks.error, {
            stage: this.state.stage,
            error,
            chart: this,
        });
        return error;
    }

    private initPlotLinesPlugin(config: YagrConfig) {
        const plotLines: PlotLineConfig[] = [];

        /** Collecting plot lines from config axes for plotLines plugin */
        Object.entries(config.axes).forEach(([scale, axisConfig]) => {
            if (axisConfig.plotLines) {
                axisConfig.plotLines.forEach((plotLine) => {
                    plotLines.push({...plotLine, scale});
                });
            }
        });

        return plotLinesPlugin(this, plotLines);
    }

    /*
     * Resize handler. Should cache height and width to avoid unneccesary resize handling,
     * when actial width and height of contentRect doesn't changed
     */
    private onResize = (args: ResizeObserverEntry[]) => {
        const [resize] = args;

        if (this._cache.height === resize.contentRect.height && this._cache.width === resize.contentRect.width) {
            return;
        }

        if (this.plugins.tooltip) {
            const t = this.plugins.tooltip;

            if (t.state.pinned && t.state.visible) {
                t.hide();
                t.pin(false);
            }
        }

        this._cache.width = this.options.width = this.root.clientWidth;
        this._cache.height = this.options.height = this.clientHeight;
        this.plugins?.legend?.redraw();
        this.uplot.setSize({
            width: this.options.width,
            height: this.options.height,
        });
        this.uplot.redraw();
        this.execHooks(this.config.hooks.resize, {entries: args, chart: this});
    };

    private init = () => {
        if (this.config.chart.size?.adaptive) {
            this.resizeOb = new ResizeObserver(debounce(this.onResize, this.config.chart.size.resizeDebounceMs || 100));
            this.resizeOb.observe(this.root);
        }

        if (!this.config.hooks.dispose) {
            this.config.hooks.dispose = [];
        }

        /** Unsubscribe in init required to avoid chars been synced without action from developer */
        this.unsubscribe();
        this.config.hooks.dispose.push(this.trackMouse());
    };

    private execHooks = <T extends YagrHooks[keyof YagrHooks]>(hooks: T, ...args: HookParams<T>) => {
        if (Array.isArray(hooks)) {
            hooks.forEach((hook) => {
                if (!hook) {
                    return;
                }

                // @ts-ignore
                typeof hook === 'function' && hook(...args);
            });
        }
    };

    private inStage(stage: YagrState['stage'], fn?: () => void) {
        this.state.stage === stage;
        this.execHooks(this.config.hooks.stage, {chart: this, stage});
        try {
            fn && fn();
        } catch (error) {
            this.onError(error as Error);
        }
        return this;
    }

    private trackMouse() {
        const mouseOver = () => {
            this.state.isMouseOver = true;
        };
        const mouseLeave = () => {
            this.state.isMouseOver = false;
        };
        this.root.addEventListener('mouseover', mouseOver);
        this.root.addEventListener('mouseleave', mouseLeave);

        return () => {
            this.root.removeEventListener('mouseover', mouseOver);
            this.root.removeEventListener('mouseleave', mouseLeave);
        };
    }

    private initRender = (u: uPlot, done: Function) => {
        /** Init legend if required */
        this.plugins.legend?.init(u);

        /** Setup font size for title if required */
        if (this.config.title && this.config.title.fontSize) {
            const size = this.config.title.fontSize;
            const t = this.root.querySelector('.u-title') as HTMLElement;
            t.setAttribute('style', `font-size:${size}px;line-height:${size}px;`);
        }

        done();
    };

    private wrapBatch(batchFn: (() => [Function | Function[], boolean]) | (() => Function)) {
        const res = batchFn();
        const [fnsOrFn, shouldRecalc] = Array.isArray(res) ? res : [res, false];
        const fns = Array.isArray(fnsOrFn) ? fnsOrFn : [fnsOrFn];

        if (this.state.inBatch) {
            this._batch.fns.push(...fns);
            this._batch.recalc = shouldRecalc;
        } else {
            this.uplot.batch(() => {
                fns.forEach((fn) => fn());
                if (shouldRecalc) {
                    this.series = this.transformSeries();
                    this.uplot.setData(this.series, true);
                }
            });
        }
    }

    private _setSeries(
        timelineOrSeriesOrId: Partial<RawSerieData>[] | number[] | number | string,
        maybeSeries?: Partial<RawSerieData>[] | Partial<RawSerieData>,
        options: UpdateOptions = {
            incremental: true,
            splice: false,
        },
    ): [Function[], boolean] {
        let timeline: number[] = [],
            series: RawSerieData[] = [],
            updateId: null | string | number = null,
            useIncremental = false,
            shouldRecalcData = false,
            useFullyRedraw;

        if (['number', 'string'].includes(typeof timelineOrSeriesOrId)) {
            useIncremental = false;
            useFullyRedraw = false;
            series = [maybeSeries] as RawSerieData[];
            updateId = timelineOrSeriesOrId as number | string;
        } else if (typeof (timelineOrSeriesOrId as Array<number | RawSerieData>)[0] === 'number') {
            timeline = timelineOrSeriesOrId as number[];
            series = maybeSeries as RawSerieData[];
            useIncremental = Boolean(options.incremental);
            useFullyRedraw = !options.incremental;
        } else {
            series = timelineOrSeriesOrId as RawSerieData[];
            useFullyRedraw = true;
        }

        if (series.some((s) => s.type)) {
            useFullyRedraw = true;
        }

        const updateFns: (() => void)[] = [];

        if (useFullyRedraw === false) {
            let shouldUpdateCursror = false;

            useIncremental && this.config.timeline.push(...timeline);
            series.forEach((serie) => {
                let matched, seriesIdx: number | undefined;

                if (typeof updateId === 'number') {
                    matched = this.config.series[updateId];
                    seriesIdx = this.config.series.length - updateId;
                } else {
                    matched = this.config.series.find(({id}) => id === serie.id || id === updateId);
                    seriesIdx = matched?.id ? this._y2uIdx[matched.id] : undefined;
                }

                if (seriesIdx === undefined) {
                    return;
                }

                const sIdx: number = seriesIdx;

                if (matched) {
                    const {data, ...rest} = serie;

                    if (useIncremental) {
                        matched.data = data ? matched.data.concat(data) : matched.data;
                    } else if (data?.length) {
                        matched.data = data;
                        shouldRecalcData = true;
                    }

                    const newSeries = configureSeries(this, Object.assign(matched, rest), seriesIdx);
                    const opts = this.options.series[seriesIdx];
                    const uOpts = this.uplot.series[seriesIdx];

                    if (uOpts.show !== newSeries.show) {
                        updateFns.push(() => {
                            this.uplot.setSeries(sIdx, {show: newSeries.show});
                        });
                    }

                    if (uOpts._focus === null ? true : uOpts._focus !== newSeries.focus) {
                        updateFns.push(() => {
                            this.uplot.setSeries(sIdx, {focus: newSeries.focus});
                        });
                    }

                    if (uOpts.color !== newSeries.color) {
                        shouldUpdateCursror = true;
                    }

                    if (newSeries.scale && this.config.scales[newSeries.scale]?.stacking) {
                        shouldRecalcData = true;
                    }

                    assignKeys(UPDATE_KEYS, opts, newSeries);
                    assignKeys(UPDATE_KEYS, uOpts, newSeries);
                } else {
                    updateFns.push(() => {
                        const newSeries = configureSeries(this, serie, this.config.series.length);
                        this._y2uIdx[newSeries.id] = this.uplot.series.length;
                        this.uplot.addSeries(newSeries, this.config.series.length);
                    });
                    this.config.series.push(serie);
                }
            });

            if (shouldUpdateCursror) {
                updateFns.push(() => {
                    this.plugins.cursor?.updatePoints();
                });
            }

            if (options.splice) {
                const sliceLength = series[0].data.length;
                this.config.series.forEach((s) => {
                    s.data.splice(0, sliceLength);
                });
                this.config.timeline.splice(0, timeline.length);
            }
        } else {
            this.inStage('config', () => {
                this.config.series = series;
                this.config.timeline = timeline;

                const uplotOptions = this.createUplotOptions();
                this._cache = {height: uplotOptions.height, width: uplotOptions.width};
                this.options = this.config.editUplotOptions ? this.config.editUplotOptions(uplotOptions) : uplotOptions;
            })
                .inStage('processing', () => {
                    const newSeries = this.transformSeries();
                    this.series = newSeries;
                    this.dispose();
                })
                .inStage('uplot', () => {
                    this.uplot = new UPlot(this.options, this.series, this.initRender);
                    this.init();
                })
                .inStage('listen');
        }

        if (timeline.length) {
            const newData = this.transformSeries();

            updateFns.push(() => {
                this.uplot.setData(newData);
            });
        }

        return [updateFns, shouldRecalcData];
    }

    private get clientHeight() {
        const MARGIN = 8;
        const offset = this.config.title.text ? (this.config.title.fontSize || DEFAULT_TITLE_FONT_SIZE) + MARGIN : 0;
        return this.root.clientHeight - offset;
    }
}

export default Yagr;
