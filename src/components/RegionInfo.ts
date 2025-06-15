import { Component } from '../ecs/Component.js';

export class RegionInfo implements Component {
  type = 'RegionInfo';
  
  constructor(
    public realmName: string = '',
    public subRegionName: string = ''
  ) {}
}