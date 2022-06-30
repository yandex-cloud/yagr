import {px} from '../../utils/common';

const NAMES = {
    size: ['height', 'width'],
    clientSize: ['clientHeight', 'clientWidth'],
    offsetSize: ['offsetHeight', 'offsetWidth'],
    maxSize: ['maxHeight', 'maxWidth'],
    before: ['top', 'left'],
    marginBefore: ['marginTop', 'marginLeft'],
    after: ['bottom', 'right'],
    marginAfter: ['marginBottom', 'marginRight'],
    scrollOffset: ['pageYOffset', 'pageXOffset'],
    offset: ['offsetY', 'offsetY'],
    offsetOpt: ['yOffset', 'xOffset'],
};

interface Props {
    size: 'height' | 'width';
    clientSize: 'clientHeight' | 'clientWidth';
    offsetSize: 'offsetHeight' | 'offsetWidth';
    maxSize: 'maxHeight' | 'maxWidth';
    before: 'top' | 'left';
    marginBefore: 'marginTop' | 'marginLeft';
    after: 'bottom' | 'right';
    marginAfter: 'marginBottom' | 'marginRight';
    scrollOffset: 'pageYOffset' | 'pageXOffset';
    offset: 'offsetY' | 'offsetY';
    offsetOpt: 'yOffset' | 'xOffset';
}

type Side = 'top' | 'bottom' | 'left' | 'right';

type Coordinates = {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
};

type Options = {
    bound?: Element | Range | Coordinates;
    xOffset?: number;
    yOffset?: number;
};

function normalizeRect(rect: DOMRect | ClientRect): Coordinates {
    return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
    };
}

// eslint-disable-next-line complexity
export default function (
    elem: HTMLElement,
    initialAnchor: Element | Range | Coordinates,
    side: Side = 'bottom',
    options: Options = {},
) {
    let anchor;

    if (initialAnchor instanceof Element || initialAnchor instanceof Range) {
        anchor = normalizeRect(elem.getBoundingClientRect());
    } else {
        anchor = initialAnchor;
    }

    const anchorRect = Object.assign(
        {
            top: anchor.bottom || 0,
            bottom: anchor.top || 0,
            left: anchor.right || 0,
            right: anchor.left || 0,
        },
        anchor,
    );

    const boundRect = {
        top: 0,
        left: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
    };

    if (options.bound) {
        if (options.bound instanceof Element || options.bound instanceof Range) {
            options.bound = normalizeRect(options.bound.getBoundingClientRect());
        }
        Object.assign(boundRect, options.bound);
    }

    const elemStyle = getComputedStyle(elem);

    const {primary, secondary} = Object.entries(NAMES).reduce(
        (acc, [key, value]) => ({
            primary: {...acc.primary, [key]: value[side === 'top' || side === 'bottom' ? 0 : 1]},
            secondary: {...acc.secondary, [key]: value[side === 'top' || side === 'bottom' ? 1 : 0]},
        }),
        {primary: {}, secondary: {}},
    ) as {
        primary: Props;
        secondary: Props;
    };

    elem.style.position = 'absolute';
    elem.style.maxWidth = '';
    elem.style.maxHeight = '';

    const offset = options[primary.offsetOpt] || 0;

    // Constrain the maximum size of the popup along the secondary axis.
    const secondaryMarginBefore = parseInt(elemStyle[secondary.marginBefore], 10);
    const secondaryMarginAfter = parseInt(elemStyle[secondary.marginAfter], 10);
    const secondaryMargin = secondaryMarginBefore + secondaryMarginAfter;

    const secondaryMaxSize = boundRect[secondary.after] - boundRect[secondary.before] - secondaryMargin;
    const styledSecondaryMaxSize = parseInt(elemStyle[secondary.maxSize], 10);

    if (!styledSecondaryMaxSize || secondaryMaxSize < styledSecondaryMaxSize) {
        elem.style[secondary.maxSize] = px(secondaryMaxSize);
    }

    // Calculate the available room on either side of the anchor element. If
    // the size of the popup is more than is available on the given side, then we
    // will switch to the side with more room.
    const margin = parseInt(elemStyle[primary.marginBefore], 10) + parseInt(elemStyle[primary.marginAfter], 10);
    const roomBefore = anchorRect[primary.before] - boundRect[primary.before] - margin;
    const roomAfter = boundRect[primary.after] - anchorRect[primary.after] - margin - offset;

    if (
        (side === primary.before && elem[primary.offsetSize] > roomBefore) ||
        (side === primary.after && elem[primary.offsetSize] > roomAfter)
    ) {
        side = roomBefore > roomAfter ? primary.before : primary.after;
    }

    // If the size of the popup exceeds the room available on this side, then
    // we will give the popup an explicit size so that it doesn't go off-screen.
    const primaryMaxSize = side === primary.before ? roomBefore : roomAfter;
    const styledPrimaryMaxSize = parseInt(elemStyle[primary.maxSize], 10);

    if (!styledPrimaryMaxSize || primaryMaxSize < styledPrimaryMaxSize) {
        elem.style[primary.maxSize] = px(primaryMaxSize);
    }

    // Set the position of the popup element along the primary axis using the
    // anchor's bounding rect. If we are working in the context of position:
    // absolute, then we will need to add the window's scroll position as well.
    const scrollOffset = window[primary.scrollOffset] as unknown as number;

    const boundPrimaryPos = (pos: number) => {
        return Math.max(
            boundRect[primary.before],
            Math.min(pos, boundRect[primary.after] - elem[primary.offsetSize] - margin),
        );
    };

    const boundSecondaryPos = (pos: number) => {
        return Math.max(
            boundRect[secondary.before],
            Math.min(pos, boundRect[secondary.after] - elem[secondary.offsetSize] - secondaryMargin),
        );
    };

    if (side === primary.before) {
        // top or left
        elem.style[primary.before] =
            scrollOffset +
            boundPrimaryPos(anchorRect[primary.before] - elem[primary.offsetSize] - margin) -
            offset +
            'px';
        elem.style[primary.after] = 'auto';
    } else {
        // bottom or right
        elem.style[primary.before] = px(scrollOffset + boundPrimaryPos(anchorRect[primary.after]) + offset);
        elem.style[primary.after] = 'auto';
    }

    // Set the position of the popup element along the secondary axis.
    const secondaryScrollOffset = window[secondary.scrollOffset] as unknown as number;

    elem.style[secondary.before] = px(
        secondaryScrollOffset + boundSecondaryPos(anchorRect[secondary.before] - secondaryMarginBefore),
    );
    elem.style[secondary.after] = 'auto';

    elem.dataset.side = side;
}
