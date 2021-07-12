export * from './YagrCore/types';
export * from './YagrCore/plugins/tooltip/types';

export {CursorOptions} from './YagrCore/plugins/cursor/cursor';
export {LegendOptions} from './YagrCore/plugins/legend/legend';

import * as DEF from './YagrCore/defaults';
export const defaults = DEF;

import 'uplot/dist/uPlot.min.css';
import './Yagr.scss';

import Yagr from './YagrCore/index';
export default Yagr;
