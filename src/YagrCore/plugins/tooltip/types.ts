import Yagr from '../../index';
import {TooltipState} from './tooltip';

export type TrackingOptions =
    /** Tracks serie only if mouse hovered on series' area */
    | 'area'
    /** Tracks mouse to closest line */
    | 'sticky'
    /** Custom tracking function */
    | ((s: TooltipSection, y: number) => number | null);
export interface TooltipRenderOpts {
    /** Tooltip option */
    options: TooltipOptions;
    /** Current X-Axis value */
    x: number;
    /** Sum aff all rows */
    sum?: string;
    /** Lines count */
    lines: number;
    /** Is tooltip pinned */
    pinned: boolean;
}

interface TooltipScale {
    scale: string;
    rows: TooltipRow[];
    sum?: number;
}
export interface TooltipRenderOptions {
    scales: TooltipScale[];
    options: TooltipOptions;
    x: number;
    pinned: boolean;
    yagr: Yagr;
    defaultRender: TooltipOptions['render'];
}

export type TitleRenderer = string | ((data: TooltipRenderOptions) => string);
export type ValueFormatter = (value: string | number | null, precision?: number) => string;
export type PerScale<T> = T | {[scale: string]: T};
export type SortFn = ((s1: TooltipRow, s2: TooltipRow) => number) | undefined;

export type TooltipHandler = (
    elem: HTMLElement,
    data: {
        state: TooltipState;
        actions: {
            pin: (state: boolean) => void;
            show: () => void;
            hide: () => void;
        };
        yagr: Yagr;
    },
) => void;

export interface TooltipOptions {
    /** Predicate to show/hide tooltip on setCursor */
    show?: boolean | ((y: Yagr) => boolean);
    /** Tracking policy:
     *  - 'area'    : track by area
     *  - 'sticky'  : finds closest dataline
     */
    tracking: PerScale<TrackingOptions>;
    /** Limit for lines in tooltip */
    maxLines: PerScale<number>;
    /** Should highlight focused line in tooltip */
    highlight: PerScale<boolean>;
    /** Show sum row */
    sum: PerScale<boolean>;
    /** Sorter */
    sort?: PerScale<SortFn>;
    /** Custom tooltip renderer */
    render: (data: TooltipRenderOptions) => string;
    /** Is tooltip pinable */
    pinable: boolean;
    /** Value formatter */
    value: PerScale<ValueFormatter>;
    /** Show DataLine index */
    showIndicies: PerScale<boolean>;
    /** Don't render null data points in tooltip */
    hideNoData?: PerScale<boolean>;
    /** Show percent row in tooltip */
    percent?: PerScale<boolean>;
    /** Element bound for tooltip (default: document.body) */
    boundClassName?: string;
    /** Value precision (default: 2) */
    precision?: PerScale<number>;
    /** Tooltip element className appendix */
    className?: string;

    /** Tooltip x-offset */
    xOffset?: number;
    /** Tooltip y-offset */
    yOffset?: number;
    /** Should stick to series if out of ranges in tracking */
    stickToRanges?: PerScale<boolean>;
    /** Title of tooltip and scale sections */
    title?: PerScale<TitleRenderer>;
    /** Titles of scales of scale sections */
    scales?: PerScale<string>;
}

export type TooltipRow = {
    /** Name of DataLine */
    name?: string;
    /** Current Y value of DataLine */
    value: string | number | null;
    /** Color of DataLine */
    color: string;
    /** Is cursor over DataLine */
    active?: boolean;
    /** Custom className */
    className?: string;
    /** Y Axis value */
    y?: number | null;
    /** real Y value on graph */
    displayY: number | null;
    /** Index of series in u.series */
    seriesIdx: number;
    /** Index of row in section */
    rowIdx: number;
    /** Original value before all transormations */
    originalValue?: number | null;
    /** Transformed value */
    transformed?: number | null | string;
};

export interface TooltipSection {
    rows: TooltipRow[];
}
