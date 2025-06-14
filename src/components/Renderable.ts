import { Component } from '../ecs/Component.js';

export class Renderable implements Component {
  readonly type = 'Renderable';

  constructor(public char: string, public priority: number = 0) {}
}