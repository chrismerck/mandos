import { Component } from './Component.js';

export class Entity {
  private components: Map<string, Component> = new Map();

  constructor(public readonly id: string) {}

  addComponent(component: Component): void {
    this.components.set(component.type, component);
  }

  getComponent<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  hasComponent(type: string): boolean {
    return this.components.has(type);
  }

  removeComponent(type: string): void {
    this.components.delete(type);
  }

  getComponents(): Component[] {
    return Array.from(this.components.values());
  }
}