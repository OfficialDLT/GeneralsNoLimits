import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacity, population, canPlace, enqueue } from './game.js';
const building = type => ({type,x:0,z:0,queue:[]});
test('barracks add 20 population capacity',()=>assert.equal(capacity([building('hq'),building('barracks')]),30));
test('queued units reserve capacity and excess training does not spend credits',()=>{const b=building('barracks');const s={money:5000,buildings:[b],units:Array.from({length:19},()=>({type:'soldier'}))};assert.equal(enqueue('soldier',b,s),null);assert.equal(population(s.units,s.buildings),20);const money=s.money;assert.match(enqueue('soldier',b,s),/populatieruimte/);assert.equal(s.money,money);});
test('tanks cost three population and require a factory',()=>{const b=building('factory');const s={money:500,buildings:[building('hq'),b],units:[]};assert.equal(enqueue('tank',b,s),null);assert.equal(s.money,200);assert.equal(population(s.units,s.buildings),3);assert.match(enqueue('tank',s.buildings[0],s),/productiegebouw/);});
test('placement rejects overlapping buildings and map boundaries',()=>{assert.equal(canPlace('barracks',0,0,[building('hq')]),false);assert.equal(canPlace('barracks',999,0,[]),false);assert.equal(canPlace('barracks',100,100,[building('hq')]),true);});
test('insufficient credits and full queues are rejected',()=>{const b=building('barracks');const s={money:99,buildings:[b],units:[]};assert.match(enqueue('soldier',b,s),/credits/);s.money=1000;b.queue=Array.from({length:5},()=>({type:'soldier'}));assert.match(enqueue('soldier',b,s),/vol/);});
