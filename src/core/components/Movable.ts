import { Component } from '../ecs/Component.js';

export class Movable implements Component {
  readonly type = 'Movable';

  constructor(public speed: number = 1) {}
}