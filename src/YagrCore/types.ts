import uPlot, {Axis as UAxis, Hooks, Series, Options, Plugin} from 'uplot';

import Yagr, {YagrMeta, YagrState} from './index';
import {TooltipOptions} from './plugins/tooltip/types';
import {LegendOptions} from './plugins/legend/legend';
import {CursorOptions} from './plugins/cursor/cursor';

type AllSeriesOptions = ExtendedSeriesOptions &
    CommonSeriesOptions &
    Omit<DotsSeriesOptions, 'type'> &
    Omit<LineSeriesOptions, 'type'> &
    Omit<AreaSeriesOptions, 'type'> &
    Omit<ColumnSeriesOptions, 'type'>;
declare module 'uplot' {
    interface Series extends Omit<AllSeriesOptions, 'data'> {
        id: string;
        color: string;
        name: string;

        /** Will appear after processing series */
        $c: DataSeriesExtended;

        /** Will appear after processing series if serie values normalized */
        normalizedData?: DataSeries;

        /** Does line have only null values */
        empty?: boolean;
        /** Real values count */
        count: number;
        /** Values sum */
        sum: number;
        /** Average value */
        avg: number;

        /** Get focus color */
        getFocusedColor: (y: Yagr, idx: number) => string;

        /** Current focus state */
        _focus?: boolean | null;
        /** Is series data transformd */
        _transformed?: boolean;
    }

    interface Axis {
        getFormatter?: (range: number) => (value: number) => string;
    }
}

/**
 * Main Yagr chart config
 */
export interface YagrConfig {
    /** Main chart visualization config */
    chart: YagrChartOptions;

    /** Graph title style. To customize other properties use CSS */
    title: {
        text: string;
        fontSize?: number;
    };

    /** Chart inline legend configuration */
    legend: LegendOptions;

    /** Config for axes. Determines style and labeling */
    axes: Record<string, AxisOptions>;

    /** Options for cursor plugin. Determines style, visibility and points render */
    cursor: CursorOptions;

    /** Timestamps */
    timeline: number[];

    /** Tooltip config. Detemines tooltip's behavior */
    tooltip: Partial<TooltipOptions>;

    /** Grid options (applies to all axes, can be overrided by axis.grid). */
    grid: UAxis.Grid;

    /** Marker visualisation options */
    markers: MarkersOptions;

    /** Scales options */
    scales: Record<string, Scale>;

    /** Raw series data and options */
    series: RawSerieData[];

    /** uPlot hooks + Yagr hooks */
    hooks: YagrHooks;

    /** Yagr data processing options */
    processing?: ProcessingSettings;

    /** uPlot options transform method */
    editUplotOptions?: (opts: Options) => Options;

    /** Additional Yagr plugins */
    plugins: Record<string, YagrPlugin>;
}

export type MinimalValidConfig = Partial<YagrConfig> & {
    timeline: Number[];
    series: RawSerieData[];
};

type ArrayElement<ArrayType extends readonly unknown[] | undefined> = ArrayType extends undefined
    ? never
    : ArrayType extends readonly (infer ElementType)[]
    ? ElementType
    : never;
type AsNonUndefined<T> = T extends undefined ? never : T;
type CommonHookHandlerArg<T> = T & {chart: Yagr};

export type HookParams<T extends YagrHooks[keyof YagrHooks]> = T extends undefined
    ? never
    : Parameters<AsNonUndefined<ArrayElement<T>>>;

export type HookHandler<Data> = ((a: CommonHookHandlerArg<Data>) => void)[];

export type LoadHandlerArg = CommonHookHandlerArg<{meta: YagrMeta}>;
export type OnSelectHandlerArg = CommonHookHandlerArg<{from: number; to: number}>;
export type ErrorHandlerArg = CommonHookHandlerArg<{type: YagrState['stage']; error: Error}>;
export type ProcessedHandlerArg = CommonHookHandlerArg<{meta: Pick<YagrMeta, 'processTime'>}>;
export type InitedHandlerArg = CommonHookHandlerArg<{meta: Pick<YagrMeta, 'initTime'>}>;
export type DisposeHandlerArg = CommonHookHandlerArg<{}>;
export type ResizeHandlerArg = CommonHookHandlerArg<{entries: ResizeObserverEntry[]}>;

export interface YagrHooks extends Hooks.Arrays {
    load?: HookHandler<{meta: YagrMeta}>;
    onSelect?: HookHandler<{from: number; to: number}>;
    error?: HookHandler<{error: Error; stage: YagrState['stage']}>;
    processed?: HookHandler<{meta: Pick<YagrMeta, 'processTime'>}>;
    inited?: HookHandler<{meta: Pick<YagrMeta, 'initTime'>}>;
    dispose?: HookHandler<{}>;
    resize?: HookHandler<{entries: ResizeObserverEntry[]}>;
    stage?: HookHandler<{stage: YagrState['stage']}>;
}

export interface ProcessingInterpolation {
    /** Interpolation type */
    /**
     * - previous: takes previous existing value
     * - left: takes previous existing value except for last point
     * - next: takes next existing value
     * - right: takes next existing value except for first point
     * - linear: calcs value by linear interpolation
     * - closes: takes closes existing value
     */
    type: 'previous' | 'left' | 'next' | 'right' | 'linear' | 'closest';

    /** Cursor and tooltip snapToValue option */
    snapToValues?: SnapToValue | false;

    /** Values to interpolate */
    value?: unknown;
}

export interface ProcessingSettings {
    /** Should interpolate missing data (default: undefined) */
    interpolation?: ProcessingInterpolation;
    /** Values to map as nulls as key-value object */
    nullValues?: Record<string, string | null>;
}

/**
 * Main chart visualization config
 */
export interface YagrChartOptions {
    /** Common series options, could be overriden by series.<option> field */
    series?: SeriesOptions;

    size?: {
        /** width (by default: 100% of root) */
        width?: number;

        /** height (by default: 100% of root) */
        height?: number;

        /** padding in css px [top, right, bottom, left] (by default: utils.chart.getPaddingByAxes) */
        padding?: [number, number, number, number];

        /** Should chart redraw on container resize (default: true) */
        adaptive?: boolean;

        /** Debounce timer for ResizeObserver to trigger: (default 100 ms) */
        resizeDebounceMs?: number;
    };

    select?: {
        /** Minial width to catch selection */
        minWidth?: number; // 15px

        /** Enable native uPlot zoom (default: true) */
        zoom?: boolean;
    };

    appereance?: {
        /** Order of drawing. Impacts on zIndex of entity. (axes, series) by default */
        drawOrder?: DrawKey[];

        /** Theme (default: 'light') */
        theme?: YagrTheme;

        /** Locale */
        locale?: SupportedLocales | Record<string, string>;
    };

    /** 1 for milliseconds, 1e-3 for seconds (default: 1) */
    timeMultiplier?: 1 | 1e-3;
}

export type ChartType = 'area' | 'line' | 'column' | 'dots';

/** Data values of lines */
export type DataSeriesExtended = (number | string | null)[];
export type DataSeries = (number | null)[];

export interface CommonSeriesOptions {
    /** Visualisation type */
    type?: ChartType;

    /** Is series visible */
    show?: boolean;

    /** Color of serie */
    color?: string;

    /** Should join paths over null-points */
    spanGaps?: boolean;

    /** Cursor options for single serie */
    cursorOptions?: Pick<CursorOptions, 'markersSize' | 'snapToValues'>;

    /** Formatter for serie value */
    formatter?: (value: string | number | null, serie: Series) => string;

    /** Line precision */
    precision?: number;

    /** Snap dataIdx value (default: closest) */
    snapToValues?: SnapToValue | false;

    /** Stacking groups */
    stackGroup?: number;

    /** Title of serie */
    title?: string | ((sIdx: number) => string);

    /** Series data transformation */
    transform?: (val: number | null | string, series: DataSeries[], idx: number) => number | null;

    /** Should show series in tooltip, added to implement more flexible patterns of lines hiding */
    showInTooltip?: boolean;
}

export interface LineSeriesOptions extends CommonSeriesOptions {
    type: 'line';

    /** Width of line (line type charts) */
    width?: number;

    /** Interpolation type */
    interpolation?: InterpolationType;
}

export interface AreaSeriesOptions extends CommonSeriesOptions {
    type: 'area';

    /** Color of line (area type charts) */
    lineColor?: string;

    /** Color of line over area (area type charts) */
    lineWidth?: number;

    /** Interpolation type (default: linear) */
    interpolation?: InterpolationType;
}

export interface ColumnSeriesOptions extends CommonSeriesOptions {
    type: 'column';
}

export interface DotsSeriesOptions extends CommonSeriesOptions {
    type: 'dots';

    /** point size (default: 4px) */
    pointsSize?: number;
}

export type SeriesOptions = DotsSeriesOptions | LineSeriesOptions | AreaSeriesOptions | ColumnSeriesOptions;

/**
 * Expected serie config and data format from Chart API
 */

export interface ExtendedSeriesOptions {
    /** Name of serie. Renders in tooltip */
    name?: string;

    /** Unique ID */
    id?: string;

    /** Scale of series */
    scale?: string;

    /** Raw data */
    data: DataSeriesExtended;

    /** Is line focused */
    focus?: boolean;
}
export type RawSerieData<T = Omit<SeriesOptions, 'type'> & {type?: ChartType}> = ExtendedSeriesOptions & T;

export type AxisSide = 'top' | 'bottom' | 'left' | 'right';

export interface AxisOptions extends Omit<UAxis, 'side'> {
    /** Config for plotlines */
    plotLines?: PlotLineConfig[];

    /** Axis side */
    side?: AxisSide;

    /** Values decimal precision (default: auto) */
    precision?: number | 'auto';

    /** default: 5 */
    splitsCount?: number;
}

interface CommonPlotLineConfig {
    /** Scale of plotLineConfig */
    scale?: string;

    /** Color of line */
    color: string;
}

export interface PBandConfig extends CommonPlotLineConfig {
    value: [from: number, to: number];
}

export interface PLineConfig extends CommonPlotLineConfig {
    value: number;

    /** Line width in px/devicePixelRatio */
    width?: number;

    /** Line stroke dash style*/
    dash?: [number, number];
}

export type PlotLineConfig = PBandConfig | PLineConfig;

/** Setting for line interpolation type */
export type InterpolationType = 'linear' | 'left' | 'right' | 'smooth';

/** Setting for scale range type */
export type ScaleRange = 'nice' | 'offset' | 'auto';

/**
 * Settings of scale
 */
export interface Scale {
    /** Scale range visualisation (default: linear) */
    type?: ScaleType;

    /** Should stack Y values (default: false) */
    stacking?: boolean;

    transform?: (v: number | null, series: DataSeries[], idx: number) => number;

    /** Should normalize (default: false)  */
    normalize?: boolean;

    /** Base of normalization (default: 100)  */
    normalizeBase?: number;

    /** min and max values of scale */
    min?: number | null;
    max?: number | null;

    /** min scale range (default: 0.01) */
    minRange?: number;

    /** view type (default: nice) */
    range?: ScaleRange | ((u: uPlot, min: number, max: number, cfg: YagrConfig) => [min: number, max: number]);
    offset?: number;
}

export type ScaleType = 'linear' | 'logarithmic';
export type YagrTheme = 'light' | 'dark';
export type SupportedLocales = 'en' | 'ru';
export type DrawKey = 'plotLines' | 'axes' | 'series';

/**
 * Options for chart grid
 */
export interface GridOptions {
    /** Show/hide grid */
    show?: boolean;

    /** Stroke color of grid */
    color?: string;

    /** Stroke width of grid */
    width?: number;

    /** Dash style array for CanvasRenderingContext2D['setLineDash']  */
    dash?: number[];
}

export interface MarkersOptions {
    /** Show markers or not */
    show?: boolean;

    /** Size of circle point (default: 2px) */
    size?: number;

    /** Width of stroke of circle point (default: 1px) */
    strokeWidth?: number;

    /** Stroke color of marker (default: #ffffff) */
    strokeColor?: string;
}

export type SnapToValue = 'left' | 'right' | 'closest';

export type YagrPlugin<T extends {} = {}, U extends Array<unknown> = []> = (
    y: Yagr,
    ...args: U
) => {
    uplot: Plugin;
} & T;
