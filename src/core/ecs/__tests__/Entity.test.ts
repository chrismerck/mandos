import { Entity } from '../Entity';
import { Component } from '../Component';

class TestComponent implements Component {
  readonly type = 'TestComponent';
  constructor(public value: string) {}
}

describe('Entity', () => {
  let entity: Entity;

  beforeEach(() => {
    entity = new Entity('test-entity');
  });

  test('should store and retrieve components', () => {
    const component = new TestComponent('test-value');
    entity.addComponent(component);

    expect(entity.hasComponent('TestComponent')).toBe(true);
    expect(entity.getComponent<TestComponent>('TestComponent')?.value).toBe('test-value');
  });

  test('should remove components', () => {
    const component = new TestComponent('test-value');
    entity.addComponent(component);
    entity.removeComponent('TestComponent');

    expect(entity.hasComponent('TestComponent')).toBe(false);
  });

  test('should return all components', () => {
    class AnotherComponent implements Component {
      readonly type = 'AnotherComponent';
      constructor(public value: string) {}
    }
    
    const comp1 = new TestComponent('value1');
    const comp2 = new AnotherComponent('value2');
    
    entity.addComponent(comp1);
    entity.addComponent(comp2);

    const components = entity.getComponents();
    expect(components).toHaveLength(2);
  });
});