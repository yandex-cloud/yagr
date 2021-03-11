import UPlot from 'uplot';
import {DEFAULT_X_SCALE} from '../../defaults';
import {PlotLineConfig} from '../../types';

const MAX_X_SCALE_LINE_OFFSET = 5;

/*
 * Plugin renders custom lines and bands on chart based on axis config.
 * Axis should be binded to scale.
 */
export default function plotLinesPlugin(plotLines: PlotLineConfig[] = []) {
    const thresholds: Record<string, PlotLineConfig[]> = {};

    function renderPlotLines(u: UPlot) {
        const {ctx} = u;
        const {height, top, width, left} = u.bbox;

        const thresholdsValues = Object.values(thresholds);

        const plotLinesToIterate = [...plotLines];

        if (thresholdsValues.length) {
            thresholdsValues.forEach((tConfigs) => {
                plotLinesToIterate.push(...tConfigs);
            });
        }

        for (const plotLineConfig of plotLinesToIterate) {
            if (!plotLineConfig.scale) { continue; }

            ctx.save();
            ctx.fillStyle = plotLineConfig.color;

            const {scale, value} = plotLineConfig;

            if (Array.isArray(value)) {
                /** This weird code should handles unexpected Inifinities in values */
                const values = value.map((val) => {
                    if (Math.abs(val) !== Infinity) {
                        return val;
                    }

                    const pos = val > 0
                        ? (scale === DEFAULT_X_SCALE ? u.width : 0)
                        : (scale === DEFAULT_X_SCALE ? 0 : u.height);

                    return u.posToVal(pos, scale);
                });

                const from = u.valToPos(values[0], scale, true);
                const to = u.valToPos(values[1], scale, true);

                if (scale === DEFAULT_X_SCALE) {
                    ctx.fillRect(from, top, to - from, height);
                } else {
                    ctx.fillRect(left, from, width, to - from);
                }
            } else {
                const from = u.valToPos(value, scale, true);
                if (scale === DEFAULT_X_SCALE) {
                    /** Workaround to ensure that plot line will not be drawn over axes */
                    const last = u.data[0][u.data[0].length - 1] as number;
                    const lastValue = u.valToPos(last, scale, true);
                    if (from - lastValue > MAX_X_SCALE_LINE_OFFSET) { continue; }

                    ctx.fillRect(from, top, plotLineConfig.width || 1, height);
                } else {
                    ctx.fillRect(left, from, width, plotLineConfig.width || 1);
                }
            }
            ctx.restore();
        }
    }

    return {
        setThreshold: (key: string, threshold: PlotLineConfig[]) => {
            thresholds[key] = threshold;
        },
        addPlotlines: (additionalPlotLines: PlotLineConfig[], scale?: string) => {
            for (const p of additionalPlotLines) {
                plotLines.push(scale ? ({scale, ...p}) : p);
            }
        },
        uPlotPlugin: {
            hooks: {
                drawClear: renderPlotLines,
            },
        },
    };
}
