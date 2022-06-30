/* eslint-disable complexity, @typescript-eslint/no-loop-func, no-nested-ternary */

import type {YagrPlugin, AxisOptions, PlotLineConfig} from '../../types';
import type uPlot from 'uplot';
import type Yagr from '../../index';
import type {Series} from 'uplot';

import {html, px} from '../../YagrCore/utils/common';

import './styles.scss';

declare module '../../types' {
    interface PlotLineConfig {
        label?: string;
    }
}

interface CommonLabel {
    show?: boolean;
    className?: string;
    position?: (xVal: number, y: number | null | undefined) => [x: number, y: number];
    renderHtml?: (yagr: Yagr, label: string, x: number, y: number) => HTMLElement;
    onRender?: (e: HTMLElement) => void;
    onDestroy?: (e: HTMLElement) => void;
}

type PerScale<T> = {[scale: string]: T};

interface TextLabel extends CommonLabel {
    label: (x: number, y: number | null | undefined) => string | undefined | null;
}
interface PlotLabel extends CommonLabel {
    label: (band: PlotLineConfig) => string | undefined | null;
}
interface AxisLabel extends CommonLabel {
    value: number;
    label: (a: AxisLabel) => string | undefined | null;
}

interface LabelsOptions {
    series?: {
        cursor?: PerScale<TextLabel>;
        focus?: PerScale<TextLabel>;
        constant?: PerScale<TextLabel>;
    };
    scales?: {
        cursor?: PerScale<TextLabel>;
        constant?: PerScale<TextLabel>;
    };
    axes?: Record<string, AxisLabel[]>;
    plotLines?: {
        cursor?: PerScale<PlotLabel>;
        constant?: PerScale<PlotLabel>;
    };
}

function renderPointLabel({
    yagr,
    x,
    y,
    className = '',
    onRender,
    onDestroy,
}: {
    yagr: Yagr;
    x: number;
    y: number;
    className?: string;
    onRender?: (e: HTMLElement) => void;
    onDestroy?: (e: HTMLElement) => void;
}) {
    const over = yagr.root.querySelector('.u-over') as HTMLElement;
    const div = html('div', {
        class: `yagr-label_point ${className}`,
        style: {
            top: px(y),
            left: px(x),
        },
    });

    over.append(div);

    onRender && onRender(div);

    return () => {
        onDestroy && onDestroy(div);
        div.remove();
    };
}

function renderTextLabel({
    yagr,
    label,
    x,
    y,
    className = '',
    shifts = {},
    onRender,
    onDestroy,
}: {
    yagr: Yagr;
    label: string;
    x: number;
    y: number;
    onRender?: (e: HTMLElement) => void;
    onDestroy?: (e: HTMLElement) => void;
    className?: string;
    shifts?: {top?: number; left?: number};
}) {
    const over = yagr.root.querySelector('.u-over') as HTMLElement;
    const div = html(
        'div',
        {
            class: `yagr-label ${className}`,
            style: {
                top: px(y + (shifts.top || 0)),
                left: px(x + (shifts.left || 0)),
            },
        },
        label,
    );

    over.append(div);

    onRender && onRender(div);

    div.style.left = px(Number(div.style.left.replace('px', '')) - div.clientWidth / 2);

    return () => {
        div.remove();
        onDestroy && onDestroy(div);
    };
}

const defaultPositionTop = (u: uPlot, x: number, y: number, scale: string) => {
    return [u.valToPos(x, 'x'), u.valToPos(y, scale) - 15];
};

const getId = () => (x: number) => String(x);

export default function YagrLabel(options: LabelsOptions): YagrPlugin {
    let textLabelsList: (
        | {idx: number; label: string | null | undefined}
        | {band: PlotLineConfig; label: string | null | undefined}
    )[] = [];

    let axisLabelsList: {scale: string; value: number; title?: string}[] = [];

    let drawClears: Function[] = [];
    let focusClears: Function[] = [];
    let cursorClears: Function[] = [];
    let pointsClears: Function[] = [];

    function drawTextOnPoint(
        yagr: Yagr,
        serieIdx: number,
        xIdx: number,
        scaleKey: string | undefined,
        labelOptions: TextLabel | undefined,
        xAxisFormatter: ReturnType<Required<AxisOptions>['getFormatter']>,
        selfAxisFormatter: ReturnType<Required<AxisOptions>['getFormatter']>,
        onDraw?: (clear: Function, label: string, serieIdx: number) => void,
    ) {
        const x = yagr.uplot.data[0][xIdx];
        const y = yagr.uplot.data[serieIdx][xIdx];

        if (y === null || y === undefined || !scaleKey || !labelOptions) {
            return;
        }

        const valX = xAxisFormatter(x);
        const valY = selfAxisFormatter(y);

        const label =
            typeof labelOptions.label === 'function'
                ? labelOptions.label(x, y)
                : labelOptions.label || `(${valX}, ${valY})`;

        if (!label || y === null || y === undefined) {
            return;
        }

        const [xP, yP] = labelOptions.position
            ? labelOptions.position(x, y)
            : defaultPositionTop(yagr.uplot, x, y, scaleKey);

        const prev = yagr.uplot.data[serieIdx][xIdx - 1];
        const next = yagr.uplot.data[serieIdx][xIdx + 1];
        const className =
            prev !== null && prev !== undefined && next !== null && next !== undefined
                ? y < prev && y < next
                    ? '_bottom'
                    : '_top'
                : '_top';

        let clear = () => {};
        if (labelOptions.show !== false) {
            clear = renderTextLabel({
                yagr,
                label,
                x: xP,
                y: yP,
                className,
                onRender: labelOptions.onRender,
                onDestroy: labelOptions.onDestroy,
            });
        }
        onDraw && onDraw(clear, label, serieIdx);
    }

    return (yagr: Yagr) => {
        function onSetCursor(u: uPlot) {
            const {left, top, idx} = u.cursor;
            const {data} = u;

            cursorClears.forEach((fn) => fn());
            cursorClears = [];
            textLabelsList = [];
            axisLabelsList = [];

            if (
                data === null ||
                idx === null ||
                idx === undefined ||
                top === undefined ||
                left === undefined ||
                left < 0 ||
                top < 0
            ) {
                return;
            }

            const sIdxs = [];

            for (let sIdx = 1; sIdx < u.series.length; sIdx++) {
                const series = u.series[sIdx];

                if (options.scales?.cursor) {
                    const scaleKey = series.scale;
                    if (scaleKey && options.scales?.cursor[scaleKey]) {
                        sIdxs.push(sIdx);
                    }
                }

                if (options.series?.cursor) {
                    if (options.series?.cursor[series.id]) {
                        sIdxs.push(sIdx);
                    }
                }
            }

            for (const sIdx of sIdxs) {
                const series = u.series[sIdx] as Required<Series>;
                const labelOptions = options.series?.cursor?.[series.id] || options.scales?.cursor?.[series.scale];
                const {scale, min, max} = series;
                const tSeries = u.series[0] as Required<uPlot.Series>;

                const selfAxisFormatter = (u.axes.find((a) => a.scale === scale)?.getFormatter || getId)(max - min);
                const xAxisFormatter = (u.axes.find((a) => a.scale === 'x')?.getFormatter || getId)(
                    tSeries.max - tSeries.min,
                );

                drawTextOnPoint(
                    yagr,
                    sIdx,
                    idx,
                    scale,
                    labelOptions,
                    xAxisFormatter,
                    selfAxisFormatter,
                    (clear, label, idx) => {
                        cursorClears.push(clear);
                        textLabelsList.push({label, idx});
                    },
                );
            }

            if (options.plotLines?.cursor) {
                const x = data[0][idx];

                const bands = [];
                for (const [scaleKey, labelOptions] of Object.entries(options.plotLines.cursor || {})) {
                    const cursorValue = Number(u.posToVal(top, scaleKey).toFixed(2));

                    const foundBands = (yagr.plugins.plotLines?.get() || []).filter((p) => {
                        if (p.scale !== scaleKey) {
                            return false;
                        }

                        const vCheck = scaleKey === 'x' ? x : cursorValue;

                        if (Array.isArray(p.value)) {
                            return vCheck >= p.value[0] && vCheck <= p.value[1];
                        } else {
                            return vCheck === p.value;
                        }
                    });

                    foundBands.length && bands.push({bands: foundBands, labelOptions, cursorValue, scaleKey});
                }

                if (bands.length) {
                    bands.forEach(({bands: sBands, labelOptions, cursorValue, scaleKey}, bI) => {
                        sBands.forEach((band, bbI) => {
                            const bIdx = bbI + bI;
                            const [xP, yP] = labelOptions.position
                                ? labelOptions.position(x, cursorValue)
                                : defaultPositionTop(yagr.uplot, x, cursorValue, scaleKey);

                            const label =
                                typeof labelOptions.label === 'function'
                                    ? labelOptions.label(band)
                                    : labelOptions.label || band.label;

                            textLabelsList.push({label, band});
                            if (label && labelOptions.show !== false) {
                                cursorClears.push(
                                    renderTextLabel({
                                        yagr,
                                        label,
                                        x: xP,
                                        y: yP,
                                        shifts: {top: bIdx * -30},
                                        onRender: labelOptions.onRender,
                                        onDestroy: labelOptions.onDestroy,
                                    }),
                                );
                            }
                        });
                    });
                }
            }

            if (options.axes) {
                const x = data[0][idx];
                Object.entries(options.axes || {}).forEach(([scaleKey, opts]) => {
                    const axis = u.axes.find((a) => a.scale === scaleKey);

                    if (!axis) {
                        return;
                    }

                    opts.forEach((opt) => {
                        const y = u.posToVal(top, scaleKey);

                        if ((scaleKey === 'x' && x === opt.value) || y === opt.value) {
                            axisLabelsList.push({...opt, scale: scaleKey});
                        }
                    });
                });
            }
        }

        function onSetFocus(u: uPlot, sIdx: number | null, opts: Series) {
            focusClears.forEach((fn) => fn());
            focusClears = [];
            textLabelsList = [];

            if (sIdx === null) {
                return;
            }

            if (opts.focus === true) {
                const series = u.series[sIdx] as Required<Series>;
                const {scale, min, max} = series;
                const tSeries = u.series[0] as Required<uPlot.Series>;
                const labelOptions = options.series?.focus?.[series.id] || options.scales?.cursor?.[series.scale];
                const selfAxisFormatter = (u.axes.find((a) => a.scale === scale)?.getFormatter || getId)(max - min);
                const xAxisFormatter = (u.axes.find((a) => a.scale === 'x')?.getFormatter || getId)(
                    tSeries.max - tSeries.min,
                );

                u.data[0].forEach((_, i) => {
                    drawTextOnPoint(yagr, sIdx, i, scale, labelOptions, xAxisFormatter, selfAxisFormatter, (clear) => {
                        focusClears.push(clear);
                    });
                });
            }
        }

        function onDraw(u: uPlot) {
            drawClears.forEach((fn) => fn());
            drawClears = [];

            const sIdxs = [];

            for (let sIdx = 1; sIdx < u.series.length; sIdx++) {
                const series = u.series[sIdx];

                if (options.scales?.constant) {
                    const scaleKey = series.scale;
                    if (scaleKey && options.scales?.constant[scaleKey]) {
                        sIdxs.push(sIdx);
                    }
                }

                if (options.series?.constant) {
                    if (options.series?.constant[series.id]) {
                        sIdxs.push(sIdx);
                    }
                }
            }

            for (const sIdx of sIdxs) {
                const series = u.series[sIdx] as Required<uPlot.Series>;
                const {scale = 'y', min, max} = series;
                const tSeries = u.series[0] as Required<uPlot.Series>;
                const labelOptions = options.series?.constant?.[series.id] || options.scales?.constant?.[series.scale];

                const selfAxisFormatter = (u.axes.find((a) => a.scale === scale)?.getFormatter || getId)(max - min);
                const xAxisFormatter = (u.axes.find((a) => a.scale === 'x')?.getFormatter || getId)(
                    tSeries.max - tSeries.min,
                );

                let idx = 0;
                while (idx < u.data[0].length) {
                    drawTextOnPoint(
                        yagr,
                        sIdx,
                        idx,
                        scale,
                        labelOptions,
                        xAxisFormatter,
                        selfAxisFormatter,
                        (clear) => {
                            drawClears.push(clear);
                        },
                    );
                    idx++;
                }
            }

            if (options.plotLines?.constant) {
                const bands = [];
                for (const [scaleName, labelOptions] of Object.entries(options.plotLines.constant || {})) {
                    const foundBands = (yagr.plugins.plotLines?.get() || []).filter((p) => {
                        return p.scale === scaleName;
                    });

                    foundBands.length && bands.push({bands: foundBands, labelOptions});
                }

                if (bands.length) {
                    bands.forEach(({bands: sBands, labelOptions}) => {
                        sBands.forEach((band) => {
                            const [x, y] =
                                band.scale === 'x'
                                    ? [Array.isArray(band.value) ? band.value[0] : band.value, u.posToVal(0, 'y')]
                                    : [u.posToVal(0, 'x'), Array.isArray(band.value) ? band.value[0] : band.value];

                            const [xP, yP] = labelOptions.position
                                ? labelOptions.position(x, y)
                                : defaultPositionTop(yagr.uplot, x, y, band.scale || 'y');

                            const label =
                                typeof labelOptions.label === 'function'
                                    ? labelOptions.label(band)
                                    : labelOptions.label || band.label;

                            if (label && labelOptions.show !== false) {
                                drawClears.push(
                                    renderTextLabel({
                                        yagr,
                                        label,
                                        x: xP,
                                        y: yP,
                                    }),
                                );
                            }
                        });
                    });
                }
            }
        }

        function onDrawAxes(u: uPlot) {
            pointsClears.forEach((fn) => fn());
            pointsClears = [];

            Object.entries(options.axes || {}).forEach(([scaleKey, opts]) => {
                const axis = u.axes.find((a) => a.scale === scaleKey);

                if (!axis) {
                    return;
                }

                opts.forEach((opt) => {
                    let x, y;
                    if (scaleKey === 'x') {
                        x = u.valToPos(opt.value, 'x');
                        y = u.valToPos(0, 'y');
                    } else {
                        x = u.valToPos(0, 'x');
                        y = u.valToPos(opt.value, 'y');
                    }

                    pointsClears.push(
                        renderPointLabel({
                            yagr,
                            x,
                            y,
                            className: opt.className,
                            onRender: opt.onRender,
                            onDestroy: opt.onDestroy,
                        }),
                    );
                });
            });
        }

        const hooks: uPlot.Plugin['hooks'] = {};

        if (options.plotLines?.cursor || options.series?.cursor || options.scales?.cursor || options.axes) {
            hooks.setCursor = onSetCursor;
        }

        if (options.scales?.constant || options.series?.constant || options.plotLines?.constant) {
            hooks.draw = onDraw;
        }

        if (options.series?.focus) {
            hooks.setSeries = onSetFocus;
        }

        if (options.axes) {
            hooks.drawAxes = onDrawAxes;
        }

        return {
            getAxisPoints: () => axisLabelsList,
            getTextLabels: () => textLabelsList,
            uplot: {
                hooks,
            },
        };
    };
}
