import uPlot, {Axis} from 'uplot';
import * as defaults from '../defaults';
import type Yagr from '../../';
import {YagrConfig, AxisOptions} from '../types';

import {getUnitSuffix, toFixed} from './common';
import {PlotLinesPlugin} from '../plugins/plotLines/plotLines';

const YAGR_AXIS_TO_UPLOT_AXIS = {
    right: Axis.Side.Right,
    top: Axis.Side.Top,
    bottom: Axis.Side.Bottom,
    left: Axis.Side.Left,
};

const AXIS_SIDE_TO_ALIGN = {
    left: Axis.Align.Right,
    right: Axis.Align.Left,
    top: undefined,
    bottom: undefined,
};

export const getAxisPositioning = (side: AxisOptions['side'], align: Axis['align']) => {
    return {
        side: side ? YAGR_AXIS_TO_UPLOT_AXIS[side] : Axis.Side.Left,
        align: align || (side ? AXIS_SIDE_TO_ALIGN[side] : undefined),
    };
};

export const getDefaultNumberFormatter = (precision: 'auto' | number, nullValue = '') => {
    return (n: number | null) => {
        if (n === null || n === undefined) {
            return nullValue;
        }

        if (n === 0) {
            return '0';
        }

        const abs = Math.abs(n);
        const precisionNum = precision === 'auto' ? 2 : precision;

        const [pow, suffix] = getUnitSuffix(abs);
        const transformedValue = n / pow;

        return (
            (precision === 'auto'
                ? String(transformedValue).replace(/\.(\d{5,})/, (match) => {
                      return match.slice(0, 6);
                  })
                : toFixed(transformedValue, precisionNum)) + suffix
        );
    };
};

/*
 * Generates ticks labels values
 */
const getNumericValueFormatter = (axisConfig: AxisOptions) => {
    const p = axisConfig.precision;
    const numFormatter = getDefaultNumberFormatter(typeof p === 'number' ? p : p || 'auto', '');
    return function defaultNumericValueFormatter(_: unknown, ticks: number[]) {
        return ticks.map(numFormatter);
    };
};

const dayTimeFormatter = uPlot.fmtDate('{DD}.{MM}.{YYYY}');
const dateTimeFormatter = uPlot.fmtDate('{HH}:{mm}:{ss}');
const minuteFormatter = uPlot.fmtDate('{mm}:{ss}');
const secondFormatter = uPlot.fmtDate('{mm}:{ss}.{fff}');

function getTimeFormatterByRange(rangeMs: number) {
    let formatter = dayTimeFormatter;
    if (rangeMs <= defaults.SECOND) {
        formatter = secondFormatter;
    } else if (rangeMs <= defaults.MINUTE) {
        formatter = minuteFormatter;
    } else if (rangeMs <= defaults.DAY) {
        formatter = dateTimeFormatter;
    }

    return (x: number) => formatter(new Date(x));
}

export const getTimeFormatter = (config: YagrConfig) => {
    const msm = config.chart.timeMultiplier || 1;
    return (_: unknown, ticks: number[]) => {
        const range = ticks[ticks.length - 1] - ticks[0];
        const rangeMs = range / msm;
        const formatter = getTimeFormatterByRange(rangeMs);

        return ticks.map((rawValue) => {
            return formatter(rawValue / msm);
        });
    };
};

function getSplits(splitsCount: number) {
    return (_: uPlot, __: number, scaleMin: number, scaleMax: number) => {
        if (splitsCount <= 2) {
            return [scaleMin, scaleMax];
        }

        const dist = Math.abs(scaleMax - scaleMin);
        const step = dist / (splitsCount - 1);
        let i = step;
        const splits = [];
        while (scaleMin + i < scaleMax) {
            splits.push(scaleMin + i);
            i += step;
        }
        return [scaleMin, ...splits, scaleMax];
    };
}

// eslint-disable-next-line complexity
function getAxis(axisConfig: AxisOptions, yagr: Yagr): Axis {
    const theme = yagr.utils.theme;
    const config = yagr.config;

    const axis: Axis = {
        splits: axisConfig.splitsCount ? getSplits(axisConfig.splitsCount) : axisConfig.splits,
        show: typeof axisConfig.show === 'undefined' ? true : axisConfig.show,
        label: axisConfig.label || undefined,
        labelSize: axisConfig.labelSize || defaults.Y_AXIS_LABEL_SIZE,
        labelFont: axisConfig.labelFont || defaults.AXIS_LABEL_FONT,
        font: axisConfig.font || defaults.AXIS_VALUES_FONT,
        stroke: axisConfig.stroke || (() => theme.AXIS_STROKE),
        ticks: axisConfig.ticks ? {...theme.Y_AXIS_TICKS, ...axisConfig.ticks} : theme.Y_AXIS_TICKS,
        grid: config.grid || axisConfig.grid || theme.GRID,
    };

    if (axisConfig.scale === defaults.DEFAULT_X_SCALE) {
        return Object.assign(axis, {
            getFormatter: getTimeFormatterByRange,
            gap: axisConfig.gap ?? defaults.X_AXIS_TICK_GAP,
            size: axisConfig.size || (() => defaults.X_AXIS_SIZE),
            values: axisConfig.values || getTimeFormatter(config),
            ticks: axisConfig.ticks ? {...theme.X_AXIS_TICKS, ...axisConfig.ticks} : theme.X_AXIS_TICKS,
            scale: defaults.DEFAULT_X_SCALE,
            space: axisConfig.space || (() => defaults.X_AXIS_SPACE),
            incrs: axisConfig.incrs || (() => defaults.X_AXIS_INCRS.map((i) => i * (config.chart.timeMultiplier || 1))),
            side: 2,
            stroke: axisConfig.stroke || (() => theme.AXIS_STROKE),
        });
    }

    Object.assign(axis, {
        gap: axisConfig.gap ?? defaults.Y_AXIS_TICK_GAP,
        size: axisConfig.size || defaults.Y_AXIS_SIZE,
        values: axisConfig.values || getNumericValueFormatter(axisConfig),
        scale: axisConfig.scale || defaults.DEFAULT_Y_SCALE,
        getFormatter: () =>
            getDefaultNumberFormatter(
                typeof axisConfig.precision === 'number' ? axisConfig.precision : axisConfig.precision || 'auto',
                '',
            ),
        ...getAxisPositioning(axisConfig.side || 'left', axisConfig.align),
    });

    if (axisConfig.space) {
        axis.space = axisConfig.space;
    }

    return axis;
}

export function getRedrawOptionsForAxesUpdate(axes: YagrConfig['axes']) {
    const options: [series: boolean, axes: boolean] = [false, true];

    Object.values(axes).forEach((s) => {
        const uOpts: (keyof AxisOptions)[] = ['align', 'side', 'size', 'label', 'labelFont', 'labelGap', 'labelSize'];
        if (uOpts.some((t) => s[t] !== undefined)) {
            options[1] = true;
        }
    });

    return options;
}

export function updateAxis(yagr: Yagr, uAxis: Axis, axisConfig: AxisOptions) {
    const upd = getAxis(axisConfig, yagr);
    upd.ticks = {...uAxis.ticks, ...upd.ticks};
    upd.grid = {...uAxis.grid, ...upd.grid};
    upd.border = {...uAxis.border, ...upd.border};
    upd.splits = upd.splits || uAxis.splits;
    Object.assign(uAxis, upd);

    const plotLines = yagr.plugins.plotLines as ReturnType<PlotLinesPlugin>;

    if (axisConfig.plotLines?.length) {
        plotLines.add(axisConfig.plotLines, axisConfig.scale);
    } else {
        plotLines.clear(axisConfig.scale);
    }
}

export function configureAxes(yagr: Yagr, config: YagrConfig) {
    const axes: Axis[] = [];

    Object.entries(config.axes).forEach(([scale, axisConfig]) => {
        axes.push(getAxis({...axisConfig, scale}, yagr));
    });

    const x = defaults.DEFAULT_X_SCALE;
    const y = defaults.DEFAULT_Y_SCALE;

    if (!config.axes[x]) {
        axes.push(getAxis({scale: x}, yagr));
    }

    if (!axes.find(({scale}) => scale !== x)) {
        axes.push(getAxis({scale: y}, yagr));
    }

    return axes;
}
