import {Series} from 'uplot';

import * as defaults from '../defaults';
import type Yagr from '..';

import {InterpolationType, RawSerieData} from '../types';
import {genId} from './common';
import {getFocusedColor, getSerieFocusColors} from './colors';
import {drawMarkersIfRequired} from '../plugins/markers';
import {pathsRenderer} from './paths';

// eslint-disable-next-line complexity
export function configureSeries(yagr: Yagr, rawSeries: RawSerieData, idx: number): Series {
    const type = rawSeries.type || yagr.config.chart.series?.type || 'line';

    const serie: Series = {
        ...rawSeries,
        type,
        show: rawSeries.show ?? true,
        name: rawSeries.name || `${yagr.utils.i18n('series')} ${idx + 1}`,
        color: rawSeries.color ? yagr.utils.colors.parse(rawSeries.color) : yagr.utils.theme.DEFAULT_LINE_COLOR,
        id: (rawSeries.id === undefined ? rawSeries.name : String(rawSeries.id)) || genId(),
        $c: rawSeries.data,
        scale: rawSeries.scale || defaults.DEFAULT_Y_SCALE,
        count: 0,
        sum: 0,
        avg: 0,
        getFocusedColor,
    };

    serie.points = serie.points || {};

    const colorFn = getSerieFocusColors(yagr, 'color');

    if (serie.type === 'area') {
        serie.lineColor = yagr.utils.colors.parse(serie.lineColor || defaults.SERIE_AREA_BORDER_COLOR);
        serie.lineWidth = serie.lineWidth || defaults.SERIE_AREA_BORDER_WIDTH;

        serie.fill = colorFn;
        serie.stroke = getSerieFocusColors(yagr, 'lineColor');
        serie.width = serie.lineWidth;
        serie.points.show = drawMarkersIfRequired;
    }

    if (serie.type === 'line') {
        serie.width = serie.width || defaults.SERIE_LINE_WIDTH;
        serie.stroke = colorFn;
        serie.points.show = drawMarkersIfRequired;
    }

    if (serie.type === 'column') {
        serie.stroke = colorFn;
        serie.fill = colorFn;
        serie.points.show = () => false;
    }

    if (serie.type === 'dots') {
        serie.stroke = serie.color;
        serie.fill = colorFn;
        serie.width = 2;
        serie.pointsSize = serie.pointsSize || defaults.DEFAULT_POINT_SIZE;
    }

    let commonI = 'linear' as InterpolationType;
    const seriesOptions = yagr.config.chart.series;
    if (seriesOptions && 'interpolation' in seriesOptions) {
        commonI = seriesOptions.interpolation || commonI;
    }
    serie.interpolation = serie.interpolation || commonI;
    serie.paths = pathsRenderer;

    return serie;
}

export const UPDATE_KEYS: (keyof Series)[] = [
    'width',
    'pointsSize',
    'fill',
    'color',
    'lineColor',
    'lineWidth',
    '$c',
    'type',
    'formatter',
    'interpolation',
];
