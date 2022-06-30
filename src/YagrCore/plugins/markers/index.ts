import type Yagr from '../../index';
import UPlot, {Plugin, Series} from 'uplot';

import {DEFAULT_X_SCALE, DEFAULT_Y_SCALE, DEFAULT_POINT_SIZE} from '../../defaults';
import {DotsSeriesOptions, YagrConfig} from '../../types';

export const renderCircle = (
    u: UPlot,
    x: number,
    y: number,
    r: number,
    s: number,
    color: string,
    strokeColor: string,
    yScale?: string,
) => {
    const {ctx} = u;
    const cx = Math.round(u.valToPos(x, DEFAULT_X_SCALE, true));
    const cy = Math.round(u.valToPos(y, yScale || DEFAULT_Y_SCALE, true));

    ctx.beginPath();
    ctx.arc(cx, cy, r * 2, 0, 2 * Math.PI);

    ctx.fillStyle = color;

    if (s) {
        ctx.lineWidth = s;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
    }

    ctx.fill();
};

export function drawMarkersIfRequired(u: UPlot, i: number, i0: number, i1: number) {
    const {color, scale, spanGaps, count} = u.series[i];

    if (spanGaps && count > 1) {
        return false;
    }

    let j = i0;
    let prev;

    while (j <= i1) {
        const val = u.data[i][j];

        if (val === null) {
            prev = val;
            j++;
            continue;
        }

        const next = u.data[i][j + 1];

        if (prev === null && next === null) {
            renderCircle(u, u.data[0][j] as number, val as number, 2, 1, color, scale || DEFAULT_Y_SCALE);
        }
        prev = val;
        j++;
    }

    return undefined;
}

/*
 * This plugin configures points markers
 */
export default function YagrMarkersPlugin(yagr: Yagr, config: YagrConfig): Plugin {
    const {size = DEFAULT_POINT_SIZE, strokeWidth = 2, strokeColor = '#ffffff', show} = config.markers;

    const defaultDotsSize = (config.chart.series as DotsSeriesOptions).pointsSize || DEFAULT_POINT_SIZE;

    function drawCircles(u: UPlot, i: number, i0: number, i1: number) {
        const {scale, _focus, color, getFocusedColor, type} = u.series[i];

        let j = i0;

        // eslint-disable-next-line no-nested-ternary
        const pointSize = type === 'dots' ? (show ? size : defaultDotsSize) : size;

        while (j <= i1) {
            const val = u.data[i][j];
            if (val !== null) {
                renderCircle(
                    u,
                    u.data[0][j] as number,
                    val as number,
                    pointSize,
                    strokeWidth,
                    (_focus || _focus === null ? color : getFocusedColor(yagr, i)) || color,
                    strokeColor,
                    scale || DEFAULT_Y_SCALE,
                );
            }
            j++;
        }

        return undefined;
    }

    const markSeries = (idx: number | null, s: Series) => {
        if (idx === 0 || idx === null) {
            return;
        }

        if (s.type === 'dots' || config.markers.show) {
            s.points = s.points || {};
            s.points.show = drawCircles;
        }
    };

    return {
        opts: (_, opts) => {
            if (!(config.markers.show || opts.series.some((s) => s.type === 'dots'))) {
                return;
            }

            opts.series.forEach((s, i) => markSeries(i, s));
        },

        hooks: {
            addSeries: (uplot, seriesIdx) => {
                const series = uplot.series[seriesIdx];
                markSeries(seriesIdx, series);
            },
            setSeries: (_, idx, series) => {
                markSeries(idx, series);
            },
        },
    };
}
