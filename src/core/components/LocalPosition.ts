import { Component } from '../ecs/Component.js';

export class LocalPosition implements Component {
  readonly type = 'LocalPosition';
  constructor(
    public wx: number = 0,
    public wy: number = 0,
    public lx: number = 21,
    public ly: number = 21
  ) {}
}
