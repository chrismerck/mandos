import { Component } from '../ecs/Component.js';

export class ViewMode implements Component {
  readonly type = 'ViewMode';
  constructor(public mode: 'world' | 'local' = 'world') {}
}
