/* eslint-disable complexity, no-nested-ternary */

import {Plugin, Series} from 'uplot';

import {CursorOptions} from '../cursor/cursor';
import placement from './placement';

import Yagr from '../../index';
import {DataSeries, ProcessingInterpolation, YagrPlugin} from '../../types';

import {TOOLTIP_Y_OFFSET, TOOLTIP_X_OFFSET, TOOLTIP_DEFAULT_MAX_LINES, DEFAULT_Y_SCALE} from '../../defaults';

import {findInRange, findDataIdx, findSticky, px} from '../../utils/common';
import {TooltipOptions, TooltipRow, TrackingOptions, ValueFormatter, TooltipSection, TooltipHandler} from './types';

import {renderTooltip} from './render';
import {getOptionValue} from './utils';

export interface TooltipState {
    /** Is tooltip pinned */
    pinned: boolean;
    /** X-Coord of click to track selections and differ them from single click */
    clickStartedX: null | number;
    /** Is tooltip visible */
    visible: boolean;
    /** Is tooltip mounted */
    mounted: boolean;
    /** Current focused series */
    focusedSeries: null | string;
}

export type TooltipAction = 'init' | 'mount' | 'render' | 'show' | 'hide' | 'pin' | 'unpin' | 'destroy';

// eslint-disable-next-line complexity
const findValue = (
    cursor: CursorOptions,
    data: DataSeries,
    serie: Series,
    idx: number,
    interpolation?: ProcessingInterpolation,
) => {
    const source = Array.isArray(serie.$c) ? serie.$c : data;
    let value = source[idx];

    if (interpolation && value === interpolation.value) {
        const snapTo = interpolation.snapToValues ?? 'closest';
        const nonNullIdx = findDataIdx(source, serie, idx, snapTo, interpolation.value);
        value = source[nonNullIdx];
    } else if (value === null) {
        const cursorSnapToValues = cursor.snapToValues ?? 'closest';
        const snapTo = serie.snapToValues ?? cursorSnapToValues;
        const nonNullIdx = findDataIdx(source, serie, idx, snapTo, null);
        value = source[nonNullIdx];
    }

    return value;
};

const DEFAULT_TOOLTIP_OPTIONS = {
    maxLines: TOOLTIP_DEFAULT_MAX_LINES,
    highlight: true,
    sum: false,
    render: renderTooltip,
    pinable: true,
    sort: undefined,
    showIndicies: false,
    hideNoData: false,
    className: 'yagr-tooltip_default',
    xOffset: TOOLTIP_X_OFFSET,
    yOffset: TOOLTIP_Y_OFFSET,
};

export type TooltipPlugin = YagrPlugin<
    {
        state: TooltipState;
        pin(pinState: boolean, position?: {x: number; y: number}): void;
        show(): void;
        hide(): void;
        updateOptions: (o: Partial<TooltipOptions>) => void;
        on: (event: TooltipAction, handler: TooltipHandler) => void;
        off: (event: TooltipAction, handler: TooltipHandler) => void;
        display: (props: {left: number; top: number; idx: number}) => void;
    },
    [Partial<TooltipOptions>]
>;

/*
 * Tooltip plugin constructor.
 * Every charts has it's own tooltip plugin instance
 */
function YagrTooltipPlugin(yagr: Yagr, options: Partial<TooltipOptions> = {}): ReturnType<TooltipPlugin> {
    const pSettings = yagr.config.processing || {};
    const handlers: Record<TooltipAction, TooltipHandler[]> = {
        init: [],
        mount: [],
        show: [],
        pin: [],
        unpin: [],
        hide: [],
        render: [],
        destroy: [],
    };

    /* Tooltip renderer, allows to deffer rendering to avoid jerky renderings when tooltip pinned */
    let renderTooltipCloses = () => {};

    const defaultTooltipValueFormatter = (n: string | number | null, precision?: number) => {
        if (typeof n === 'string') {
            if (pSettings.nullValues && pSettings.nullValues.hasOwnProperty(n)) {
                return pSettings.nullValues[n] as string;
            }

            return '-';
        }

        if (typeof n === 'number') {
            return n.toFixed(
                // eslint-disable-next-line no-nested-ternary
                typeof precision === 'number'
                    ? precision
                    : typeof options.precision === 'number'
                    ? options.precision
                    : 2,
            );
        }

        return '-';
    };

    const opts: TooltipOptions = {
        ...DEFAULT_TOOLTIP_OPTIONS,
        tracking: yagr.config.chart.series?.type === 'area' ? 'area' : 'sticky',
        value: defaultTooltipValueFormatter,
        ...options,
    };

    let over: HTMLDivElement;
    let bLeft: number;
    let bTop: number;
    let bound: HTMLElement;

    const tOverlay = document.createElement('div');

    tOverlay.id = `${yagr.id}_tooltip`;
    tOverlay.className = `yagr-tooltip ${opts.className || ''}`;
    tOverlay.style.display = 'none';

    const state: TooltipState = {
        mounted: true,
        pinned: false,
        visible: false,
        clickStartedX: null,
        focusedSeries: null,
    };

    const emit = (action: TooltipAction) => {
        handlers[action].forEach((handler) => {
            handler(tOverlay, {
                state,
                actions: {
                    pin,
                    show,
                    hide,
                },
                yagr,
            });
        });
    };

    emit('init');
    document.body.appendChild(tOverlay);
    state.mounted = true;
    emit('mount');

    function show() {
        const shouldEmit = !state.visible;
        state.visible = true;
        tOverlay.style.display = 'block';
        shouldEmit && emit('show');
    }

    function hide() {
        const shouldEmit = state.visible;
        state.visible = false;
        tOverlay.style.display = 'none';
        emit('hide');
        shouldEmit && emit('show');
    }

    const checkFocus = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        let serieIdx: string | undefined;

        if (target && tOverlay.contains(target) && target.classList.contains('yagr-tooltip__item')) {
            serieIdx = target.dataset['series'];
        }

        const serie = serieIdx ? yagr.uplot.series[Number(serieIdx)] : null;

        if (serieIdx && serie) {
            state.focusedSeries = serieIdx;
            yagr.setFocus(serie.id, true);
        } else if (state.focusedSeries) {
            state.focusedSeries = null;
            yagr.setFocus(null, true);
        }
    };

    const onMouseDown = (event: MouseEvent) => {
        state.clickStartedX = event.clientX;
    };

    const detectClickOutside = (event: MouseEvent) => {
        const target = event.target;

        if (target instanceof Element) {
            const isClickInsideTooltip = target && tOverlay.contains(target);
            const isClickOnUplotOver = target && over.contains(target);

            if (!isClickInsideTooltip && !isClickOnUplotOver) {
                pin(false);
                hide();
            }
        }
    };

    function pin(pinState: boolean, position?: {x: number; y: number}) {
        if (position) {
            placement(
                tOverlay,
                {
                    left: position.x + bLeft,
                    top: bTop + position.y - (opts.yOffset || 0),
                },
                'right',
                {
                    bound,
                    xOffset: opts.xOffset,
                    yOffset: opts.yOffset,
                },
            );
        }

        const list = tOverlay.querySelector('._tooltip-list') as HTMLElement;
        state.pinned = pinState;

        yagr.plugins.cursor?.pin(pinState);

        if (pinState) {
            if (!state.visible) {
                show();
            }

            tOverlay.classList.add('yagr-tooltip_pinned');
            if (list && list?.clientHeight) {
                list.style.height = px(list.clientHeight);
            }

            if (opts.render === renderTooltip) {
                document.addEventListener('mousemove', checkFocus);
                document.addEventListener('mousedown', detectClickOutside);
            }
        } else {
            tOverlay.classList.remove('yagr-tooltip_pinned');

            if (opts.render === renderTooltip) {
                document.removeEventListener('mousemove', checkFocus);
                document.removeEventListener('mousedown', detectClickOutside);
            }
        }

        emit(pinState ? 'pin' : 'unpin');
    }

    const onMouseUp = (event: MouseEvent) => {
        if (opts.pinable && state.clickStartedX && state.clickStartedX === event.clientX) {
            pin(!state.pinned);
            show();
            renderTooltipCloses();
        }
    };

    const onMouseEnter = () => {
        show();
    };

    const onMouseLeave = () => {
        if (!state.pinned) {
            hide();
        }
    };

    const interpolation = pSettings.interpolation;
    const stripValue = interpolation ? interpolation.value : undefined;

    function calcTooltip(props: {left: number; top: number; idx: number}) {
        const u = yagr.uplot;
        const {left, top, idx} = props;

        if (opts.show && typeof opts.show === 'function' && opts.show(yagr) === false) {
            hide();
            return;
        }

        if ((left < 0 || top < 0) && !state.pinned) {
            hide();
        }

        const {data} = u;

        if (data === null || idx === null || idx === undefined || top === undefined) {
            return;
        }

        const x = data[0][idx];

        const sum: Record<string, number> = {};
        const sections: Record<string, TooltipSection> = {};

        const rowsBySections: Record<string, number[]> = {};

        let i = 1;
        while (i < u.series.length) {
            const serie = u.series[i];

            if (!serie.show) {
                i += 1;
                continue;
            }

            const scale = serie.scale || DEFAULT_Y_SCALE;

            rowsBySections[scale] = rowsBySections[scale] || [];
            rowsBySections[scale].push(i);
            i += 1;
        }

        const rowEntries = Object.entries(rowsBySections);

        rowEntries.forEach(([scale, serieIndicies]) => {
            sections[scale] = sections[scale] || {
                rows: [],
            };
            const section = sections[scale];
            const cursorValue = Number(u.posToVal(top, scale).toFixed(2));

            const valueRender = getOptionValue<ValueFormatter>(opts.value, scale);

            for (const seriesIdx of serieIndicies) {
                const seriesData = u.data[seriesIdx] as DataSeries;
                const serie = u.series[seriesIdx];

                let value = findValue(yagr.config.cursor, seriesData, serie, idx, interpolation);
                let dValue = value;

                if (typeof value === 'string') {
                    dValue = value;
                    value = null;
                }

                if (getOptionValue(opts.sum, scale)) {
                    sum[scale] = sum[scale] || 0;
                    sum[scale] += value || 0;
                }

                const realY = seriesData[idx];
                const yValue = serie.$c && serie.$c[idx] === stripValue ? value : realY;

                if ((value === null && opts.hideNoData) || serie.showInTooltip === false) {
                    continue;
                }

                const seriesPrecision = serie.precision ?? getOptionValue(opts.precision, scale);

                const displayValue = serie.formatter
                    ? serie.formatter(dValue, serie)
                    : valueRender(dValue, seriesPrecision);

                const rowData: TooltipRow = {
                    name: serie.name,
                    originalValue: value,
                    value: displayValue,
                    y: yValue,
                    displayY: realY,
                    color: serie.color,
                    seriesIdx,
                    rowIdx: section.rows.length ? section.rows[section.rows.length - 1].rowIdx + 1 : 0,
                };

                if (serie.normalizedData) {
                    rowData.transformed = serie.normalizedData[idx];
                }

                if (serie._transformed) {
                    rowData.transformed = seriesData[idx];
                }

                section.rows.push(rowData);
            }

            if (getOptionValue(opts.highlight, scale) && section.rows.length) {
                const tracking = getOptionValue<TrackingOptions>(opts.tracking, scale);
                let activeIndex: number | null = 0;
                if (tracking === 'area') {
                    activeIndex = findInRange(
                        section,
                        cursorValue,
                        getOptionValue<boolean | undefined>(opts.stickToRanges, scale),
                    );
                } else if (tracking === 'sticky') {
                    activeIndex = findSticky(section, cursorValue);
                } else if (typeof tracking === 'function') {
                    activeIndex = tracking(section, cursorValue);
                }

                if (activeIndex !== null) {
                    section.rows[activeIndex].active = true;
                }
            }

            const sort = getOptionValue(opts.sort, scale);
            if (sort) {
                section.rows.sort(sort);
            }
        });

        const hasOneRow = Object.values(sections).some(({rows}) => rows.length > 0);

        if (hasOneRow) {
            onMouseEnter();
        } else {
            onMouseLeave();
            return;
        }

        const bbox = over.getBoundingClientRect();

        bLeft = bbox.left;
        bTop = bbox.top;

        const anchor = {
            left: left + bLeft,
            top: bTop + top - (opts.yOffset || 0),
        };

        renderTooltipCloses = () => {
            tOverlay.innerHTML = opts.render({
                scales: Object.entries(sections).map(([scale, sec]) => {
                    return {
                        scale,
                        rows: sec.rows,
                        sum: sum[scale],
                    };
                }),
                options: opts,
                x,
                pinned: state.pinned,
                yagr,
                defaultRender: DEFAULT_TOOLTIP_OPTIONS.render,
            });

            placement(tOverlay, anchor, 'right', {
                bound,
                xOffset: opts.xOffset,
                yOffset: opts.yOffset,
            });

            emit('render');
        };

        if (state.pinned) {
            return;
        }

        renderTooltipCloses();
    }

    const uPlotPlugin: Plugin = {
        hooks: {
            init: (u) => {
                over = u.root.querySelector('.u-over') as HTMLDivElement;

                over.addEventListener('mousedown', onMouseDown);
                over.addEventListener('mouseup', onMouseUp);
                over.addEventListener('mouseenter', onMouseEnter);
                over.addEventListener('mouseleave', onMouseLeave);
            },
            setData: (u) => {
                if (!u.data.every(Array.isArray)) {
                    throw new Error('Tooltip plugin applied to unconvient datalines: expected number[][]');
                }
            },
            setSize: () => {
                const bbox = over.getBoundingClientRect();

                bLeft = bbox.left;
                bTop = bbox.top;

                bound = opts.boundClassName
                    ? document.querySelector(opts.boundClassName) || document.body
                    : document.body;
            },

            setCursor: (u) => {
                calcTooltip(u.cursor as Parameters<typeof calcTooltip>[0]);
            },
            destroy: () => {
                /** Free overlay listeners */
                over.removeEventListener('mousedown', onMouseDown);
                over.removeEventListener('mouseup', onMouseUp);
                over.removeEventListener('mouseenter', onMouseEnter);
                over.removeEventListener('mouseleave', onMouseLeave);

                /** Removing tooltip on destroy */
                tOverlay.remove();
                state.mounted = false;
                emit('destroy');
            },
        },
    };

    function updateOptions(newOptions: Partial<TooltipOptions>) {
        Object.assign(opts, newOptions);
        tOverlay.className = `yagr-tooltip ${opts.className || ''}`;
    }

    function on(event: TooltipAction, handler: TooltipHandler) {
        handlers[event].push(handler);
    }

    function off(event: TooltipAction, handler: TooltipHandler) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
    }

    return {
        state,
        pin,
        show,
        hide,
        uplot: uPlotPlugin,
        display: calcTooltip,
        updateOptions,
        on,
        off,
    };
}

export default YagrTooltipPlugin;
