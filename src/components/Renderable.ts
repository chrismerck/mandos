import { Component } from '../ecs/Component.js';

export type Color = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray' | 'grey' | 
                    'redBright' | 'greenBright' | 'yellowBright' | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright';

export class Renderable implements Component {
  readonly type = 'Renderable';

  constructor(
    public char: string, 
    public priority: number = 0,
    public color?: Color,
    public backgroundColor?: Color,
    public bold: boolean = false,
    public dim: boolean = false
  ) {}
}