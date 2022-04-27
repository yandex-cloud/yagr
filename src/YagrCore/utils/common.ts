/* eslint-disable no-nested-ternary */

import {Series} from 'uplot';
import {DataSeriesExtended, DataSeries, SnapToValue, ProcessingSettings, ProcessingInterpolation} from '../types';
import {TooltipSection} from '../plugins/tooltip/types';

/**
 * Finds index of point in ranges of Y-Axis values.
 * Returns index of starting range when idx < Y <= idx next
 *
 * @param {TooltipSection} section - tooltip section
 * @param {number} value - Y value of cursor
 * @param {boolean} stickToRanges - if true, then always return index of range
 * @returns {number | null}
 */
export const findInRange = (section: TooltipSection, value: number, stickToRanges = true): number | null => {
    const positive = value >= 0;
    let max = -Infinity,
        maxIdx = null;
    let min = Infinity,
        minIdx = null;

    const diffs: Array<number | null> = [];
    let result: number | null = null;

    section.rows.forEach((row) => {
        const {displayY: y, rowIdx} = row;

        let diff: number | null;

        if (y !== null) {
            if (y > max) {
                max = y;
                maxIdx = row.rowIdx;
            }

            if (y < min) {
                min = y;
                minIdx = row.rowIdx;
            }
        }

        if (y === null || (positive ? y < 0 : y >= 0)) {
            diff = null;
        } else if (positive) {
            diff = value > y ? null : y - value;
        } else {
            diff = value < y ? null : Math.abs(y - value);
        }

        const currentMin = result === null ? Infinity : (diffs[result] as number);
        const nextMin = diff === null ? currentMin : Math.min(currentMin, diff);

        if ((diff !== null && currentMin === diff) || nextMin !== currentMin) {
            result = rowIdx;
        }
    });

    if (result === null && stickToRanges) {
        return value >= max ? maxIdx : value <= min ? minIdx : null;
    }

    return result;
};

/* Gets sum of all values of given data index by all series */
export const getSumByIdx = (series: DataSeriesExtended[], seriesOptions: Series[], idx: number, scale: string) => {
    let sum = 0;
    let i = 0;
    while (i < series.length) {
        const serie = series[i];
        const opts = seriesOptions[seriesOptions.length - i - 1];
        i += 1;
        if (opts.scale !== scale || opts.show === false) {
            continue;
        }
        const value = serie[idx];
        sum += typeof value === 'number' ? value : 0;
    }
    return sum;
};

/**
 * Finds index of nearest non-null point in range of Y-Axis values
 *
 * @param {TooltipSection} section
 * @param {number} value
 * @returns {number | null}
 */
export const findSticky = (section: TooltipSection, value: number): number | null => {
    const ranges = section.rows.map((x) => x.displayY);

    let nearestIndex;
    let nearestValue;

    let i = 0;
    while (!nearestValue && i < ranges.length) {
        const r = ranges[i];
        if (r !== null) {
            nearestIndex = i;
            nearestValue = Math.abs(r - (value || 0));
        }
        i += 1;
    }

    if (!nearestValue || nearestIndex === undefined) {
        return null;
    }

    for (i = nearestIndex + 1; i < ranges.length; i++) {
        const v = ranges[i];

        if (v === null) {
            continue;
        }

        const diff = Math.abs(v - value);

        if (nearestValue > diff) {
            nearestValue = diff;
            nearestIndex = i;
        }
    }

    return nearestIndex;
};

export const getUnitSuffix = (value: number): [number, string] => {
    if (value >= 1e18) {
        return [1e18, 'E'];
    } else if (value >= 1e15) {
        return [1e15, 'P'];
    } else if (value >= 1e12) {
        return [1e12, 'T'];
    } else if (value >= 1e9) {
        return [1e9, 'G'];
    } else if (value >= 1e6) {
        return [1e6, 'M'];
    } else if (value >= 1e3) {
        return [1e3, 'K'];
    }
    return [1, ''];
};

/* Number.toFixed() wihout rounding */
export function toFixed(num: number, fixed: number) {
    if (fixed === 0) {
        return parseInt(num as unknown as string);
    }

    if (Number.isInteger(num)) {
        return num + '.' + '0'.repeat(fixed);
    }

    const [int, frac] = num.toString().split('.');
    return frac.length >= fixed ? `${int}.${frac.slice(0, fixed)}` : `${int}.${frac}${'0'.repeat(fixed - frac.length)}`;
}

/**
 * Finds nearest non-null value's index in data series by given direction
 *
 * @param {DataSeriesExtended} data - Series data
 * @param {Series} series - Series options
 * @param {number} idx - cursor index
 * @param {SnapToValue | false} defaultSnapTo - default value for direction
 * @param {unknown} skipValue - value to skip
 * @returns {number}
 */
export function findDataIdx(
    data: DataSeriesExtended,
    series: Series,
    idx: number,
    defaultSnapTo: SnapToValue | false = 'closest',
    skipValue: unknown = null,
) {
    let corL = idx,
        corR = idx;

    const direction = series.snapToValues ?? defaultSnapTo;

    if (direction === false) {
        return idx;
    }

    if (direction === 'left' || direction === 'closest') {
        for (let i = idx - 1; i >= 0; i--) {
            if (data[i] !== skipValue) {
                corL = i;
                break;
            }
        }
    }

    if (direction === 'right' || direction === 'closest') {
        for (let i = idx + 1; i < data.length; i++) {
            if (data[i] !== skipValue) {
                corR = i;
                break;
            }
        }
    }

    if (direction === 'left') {
        return corL;
    }
    if (direction === 'right') {
        return corR;
    }

    return corR - idx > idx - corL ? corL : corR;
}

/*
 * Interpolation function
 */
const interpolateImpl = (
    timeline: number[],
    y1: number | null,
    y2: number | null,
    x1: number,
    x2: number,
    xIdx: number,
    iGroup: number[],
    type: ProcessingInterpolation['type'] | number = 'linear',
) => {
    let result = null;
    const x = timeline[xIdx];

    switch (type) {
        case 'linear': {
            if (y1 === null || y2 === null) {
                return null;
            }

            result = y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);

            if (isNaN(result) || Math.abs(result) === Infinity) {
                result = null;
            }
            break;
        }
        case 'previous': {
            result = y1;
            break;
        }
        case 'next': {
            result = y2;
            break;
        }
        case 'left': {
            result = iGroup[iGroup.length - 1] === timeline.length - 1 || y2 === null ? null : y1;
            break;
        }
        case 'right': {
            result = iGroup[0] === 0 ? null : y2;
            break;
        }
        case 'closest': {
            const lD = Math.abs(x1 - timeline[xIdx]);
            const rD = Math.abs(x2 - timeline[xIdx]);
            result = lD < rD ? y1 : y2;
            break;
        }
        default: {
            result = type;
        }
    }
    return result;
};

export const genId = () => Math.random().toString(36).substr(2, 9).replace(/^\d+/, '');

/**
 * Processing data series to:
 *  1. Find missing data and interpolate these points
 *  2. Find string special values to convert them to nulls
 *
 * @param {DataSeriesExtended[]} series
 * @param {number[]} timeline
 * @param {ProcessingSettings} settings
 * @returns {DataSeries[]}
 */
export const preprocess = (
    series: DataSeriesExtended[],
    timeline: number[],
    settings: ProcessingSettings,
): DataSeries[] => {
    const result = [];
    const nullValues = settings.nullValues || {};
    const interpolation = settings.interpolation;
    for (let sIdx = 0; sIdx < series.length; sIdx++) {
        const line = series[sIdx];
        const resultLine = [];

        let iGroup = [];
        let y1 = null,
            y2 = null,
            x1,
            x2;

        for (let idx = 0; idx < line.length; idx++) {
            let val = line[idx];

            if (interpolation && val === interpolation.value) {
                iGroup.push(idx);
                continue;
            }

            if (nullValues[val as string]) {
                val = null;
            }

            if (iGroup.length) {
                y2 = val;
                x2 = timeline[idx];
                for (const iIdx of iGroup) {
                    resultLine[iIdx] = interpolateImpl(
                        timeline,
                        y1 as number | null,
                        y2 as number | null,
                        x1 || timeline[0],
                        x2 || timeline[timeline.length - 1],
                        iIdx,
                        iGroup,
                        interpolation && interpolation.type,
                    );
                }
                iGroup = [];
            }

            y1 = val;
            x1 = timeline[idx];
            resultLine.push(val);
        }

        y2 = null;

        if (iGroup.length) {
            for (const iIdx of iGroup) {
                resultLine.push(
                    interpolateImpl(
                        timeline,
                        y1 as number | null,
                        y2 as number | null,
                        x1 || timeline[0],
                        x2 || timeline[timeline.length - 1],
                        iIdx,
                        iGroup,
                        interpolation && interpolation.type,
                    ),
                );
            }
        }
        result.push(resultLine);
    }

    return result as DataSeries[];
};

export const exec = <T, ArgsT extends unknown[]>(s: T | ((...a: ArgsT) => T), ...args: ArgsT) => {
    return typeof s === 'function' ? (s as (...a: ArgsT) => T)(...args) : s;
};

export function debounce<T extends Array<unknown> = []>(func: (...args: T) => void, timeout = 300) {
    let timer: ReturnType<typeof setTimeout>;

    return (...args: T) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), timeout);
    };
}

export const assignKeys = <T>(keys: (keyof T)[], f: T, t: T) => {
    keys.forEach((key) => {
        if (t[key] !== undefined) {
            if (typeof t[key] === 'object' && !Array.isArray(t[key])) {
                Object.assign(f[key], t[key]);
            } else {
            }
        }
    });
};
