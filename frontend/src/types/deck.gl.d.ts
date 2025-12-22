// Type declarations for deck.gl modules

declare module '@deck.gl/react' {
  import { Component } from 'react';

  export interface DeckGLProps {
    views?: any;
    initialViewState?: any;
    controller?: boolean | any;
    layers?: any[];
    getTooltip?: (info: any) => any;
    onClick?: (info: any, event: any) => void;
    onViewStateChange?: (params: any) => void;
    width?: string | number;
    height?: string | number;
    style?: React.CSSProperties;
    pickingRadius?: number;
  }

  export default class DeckGL extends Component<DeckGLProps> {}
}

declare module '@deck.gl/layers' {
  export class ScatterplotLayer<D = any> {
    constructor(props: {
      id: string;
      data: D[];
      getPosition: (d: D) => [number, number] | [number, number, number];
      getFillColor?: (d: D) => [number, number, number, number] | [number, number, number];
      getRadius?: number | ((d: D) => number);
      radiusUnits?: 'meters' | 'pixels';
      pickable?: boolean;
      autoHighlight?: boolean;
      highlightColor?: [number, number, number, number];
      onClick?: (info: { object?: D; index?: number }) => void;
      updateTriggers?: Record<string, any>;
      radiusMinPixels?: number;
      radiusMaxPixels?: number;
    });
  }
}

declare module '@deck.gl/core' {
  export class OrthographicView {
    constructor(props?: { id?: string; controller?: boolean });
  }

  export class MapView {
    constructor(props?: { id?: string; controller?: boolean });
  }
}
