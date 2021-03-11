
import UPlot, {Plugin} from 'uplot';

import {CURSOR_STYLE, MARKER_DIAMETER, SERIE_COLOR} from '../../defaults';
import {colorParser} from '../../utils/colors';
import {findDataIdx} from '../../utils/common';

export enum SnapToValue {
    Left = 'left',
    Right = 'right',
    Closest = 'closest',
}

/**
 * Options for cursor plugin.
 */
export interface CursorOptions {
    /** Diameter of point markers */
    markersSize?: number;
    /** Snap cursor to non-null value (default: SnapToValue.Closest) */
    snapToValues?: false | SnapToValue;
    /** X crosshair options */
    x: {
        visible?: boolean;
        style?: string; // css style
    };
    /** Y crosshair options */
    y: {
        visible?: boolean;
        style?: string;
    };
}

const MAX_CURSORS = 50;

/*
 *
 */
export default function CursorPlugin(opts: CursorOptions): Plugin {
    const snapTo = opts.snapToValues === false
        ? false
        : opts.snapToValues || SnapToValue.Closest;

    /*
    * This function finds non null value index and returns
    * it's value for drawIdx hook for cursor
    */
    const snapOnValues = (self: UPlot, seriesIdx: number, hoveredIdx: number) => {
        const seriesData = self.data[seriesIdx];
        const series = self.series[seriesIdx];

        if (seriesData[hoveredIdx] === null && snapTo) {
            return findDataIdx(seriesData, series, hoveredIdx, snapTo);
        }

        return hoveredIdx;
    };

    /*
    * Draws HTML points for cursor to transform
    */
    function cursorPoint(u: UPlot, seriesIndex: number) {
        const serie = u.series[seriesIndex];

        const pt = document.createElement('div');

        // @TODO возможно сюда надо добавить возможность вообще не рендерить точку курсора, если возможно
        // по признаку в serie (нужен PR в uPlot)
        if (serie.empty) {
            pt.style.display = 'none';
            return pt;
        }
        const span = document.createElement('span');

        pt.appendChild(span);
        pt.classList.add('yagr-point');

        const size = (serie.cursorOptions ? serie.cursorOptions.markersSize : opts?.markersSize) || MARKER_DIAMETER;
        const margin = ((size - 2) / -2) - 1;

        pt.style.width = `${size}px`;
        pt.style.height = `${size}px`;
        pt.style.background = `solid 1px ${serie.color}`;
        pt.style.marginLeft = `${margin}px`;
        pt.style.marginTop = `${margin}px`;
        span.style.background = serie.color || SERIE_COLOR;
        const colorRgba = colorParser.toRgba(serie.color, [256, 256, 256, 0]);
        pt.style.boxShadow = `0px 0px 0px 1px rgba(${colorRgba[0]}, ${colorRgba[1]}, ${colorRgba[2]}, 0.5)`;

        return pt;
    }

    return {
        opts: (_, uplotOptions) => {
            uplotOptions.cursor = uplotOptions.cursor || {};

            const emptyLines = uplotOptions.series.filter((s) => s.empty).length;
            const totalLines = uplotOptions.series.length - 1;
            uplotOptions.cursor.points = {
                show: totalLines - emptyLines <= MAX_CURSORS ? cursorPoint : false,
            };

            if (opts.snapToValues !== false) {
                uplotOptions.cursor.dataIdx = snapOnValues;
            }
        },
        hooks: {
            init: (u) => {
                const cX: HTMLElement | null = u.root.querySelector('.u-cursor-x');
                if (cX) {
                    if (opts.x && opts.x.visible !== false) {
                        cX.style.borderRight = opts.x.style || CURSOR_STYLE;
                    } else {
                        cX.style.display = 'none';
                    }
                }

                const cY: HTMLElement | null = u.root.querySelector('.u-cursor-y');
                if (cY) {
                    if (opts.y && opts.y.visible !== false) {
                        cY.style.borderBottom = opts.y.style || CURSOR_STYLE;
                    } else {
                        cY.style.display = 'none';
                    }
                }
            },
        },
    };
}
