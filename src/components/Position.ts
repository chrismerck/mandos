import { Component } from '../ecs/Component.js';

export class Position implements Component {
  readonly type = 'Position';

  constructor(public x: number, public y: number) {}
}