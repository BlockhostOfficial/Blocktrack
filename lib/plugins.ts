import uPlot from "uplot";

export function uPlotTooltipPlugin (onHover: (pos?: {left: number, top: number}, idx?: number) =>  void): uPlot.Plugin {
  let element: Element

  return {
    hooks: {
      init: u => {
        element = u.root.querySelector('.u-over')!

        if (element instanceof HTMLElement) {
          element.onmouseenter = () => onHover()
          element.onmouseleave = () => onHover()
        }
      },
      setCursor: u => {
        const {
          left,
          top,
          idx
        } = u.cursor

        if (left === undefined || top === undefined || idx === undefined || element === null) {
          onHover()
        } else {
          const bounds = element.getBoundingClientRect()

          onHover({
            left: bounds.left + left + window.scrollX,
            top: bounds.top + top + window.scrollY
          }, idx)
        }
      }
    }
  }
}
