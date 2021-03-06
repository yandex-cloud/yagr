# Visualization types

Yagr supports four timeseries visualization types:

## Line

-   `'line'`

![Line](../../assets/line.png =600x100%)

## Area

Areas are filled-in spaces between lines. If two areas are overlapping with the lowest series, the index will be in the background.

-   `'area'`

![Area](../../assets/area.png =600x100%)

## Dots

-   `'dots'`

![Dots](../../assets/dots.png =600x100%)

## Column

-   `'column'`

![Column](../../assets/column.png =600x100%)

## Configuration

You can configure a chart type for whole charts:

```js
chart: {
    series: {
        type: 'line',
    }
}
```

or per series

```js
chart: {
    series: {
        type: 'line',
    }
},
series: [
    {data: [2, 4, 1], color: 'green'},             // will render line (by default in chart.type)
    {data: [1, 2, 3], color: 'red', type: 'area'}, // will render area
]
```

Keep in mind that Yagr draws the first series from the last to the first, so if you render a non-transparent area first, it might overlap other series. Be careful.
