import { Entity } from './Entity.js';
import { System } from './System.js';

export class World {
  private entities: Map<string, Entity> = new Map();
  private systems: System[] = [];
  private entityCounter = 0;

  createEntity(): Entity {
    const id = `entity_${this.entityCounter++}`;
    const entity = new Entity(id);
    this.entities.set(id, entity);
    return entity;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  removeEntity(id: string): void {
    this.entities.delete(id);
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(deltaTime: number): void {
    for (const system of this.systems) {
      system.update(this, deltaTime);
    }
  }

  getEntitiesWithComponent(componentType: string): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.hasComponent(componentType)) {
        result.push(entity);
      }
    }
    return result;
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }
}