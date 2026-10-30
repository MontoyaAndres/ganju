// `--where` shorthand: what each condition becomes in the rows route's JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseValue, parseWhere } from '../src/data/where.ts';

test('nothing given is no filter', () => {
  assert.equal(parseWhere(undefined), undefined);
  assert.equal(parseWhere([]), undefined);
  assert.equal(parseWhere(['  ']), undefined);
});

test('equality stays a bare value, as the API writes it', () => {
  assert.deepEqual(parseWhere(['status=open']), { status: 'open' });
  assert.deepEqual(parseWhere('status=open'), { status: 'open' });
});

test('every comparison operator', () => {
  assert.deepEqual(parseWhere(['price<30000']), { price: { lt: 30000 } });
  assert.deepEqual(parseWhere(['price<=30000']), { price: { lte: 30000 } });
  assert.deepEqual(parseWhere(['price>10']), { price: { gt: 10 } });
  assert.deepEqual(parseWhere(['price>=10']), { price: { gte: 10 } });
  assert.deepEqual(parseWhere(['status!=done']), { status: { ne: 'done' } });
  assert.deepEqual(parseWhere(['name~pizza']), { name: { contains: 'pizza' } });
  assert.deepEqual(parseWhere(['name^=Marg']), { name: { startsWith: 'Marg' } });
});

test('values: numbers, booleans and null mean themselves; quotes keep text', () => {
  assert.deepEqual(parseWhere(['stock=0']), { stock: 0 });
  assert.deepEqual(parseWhere(['price>=10.5']), { price: { gte: 10.5 } });
  assert.deepEqual(parseWhere(['delta>-3']), { delta: { gt: -3 } });
  assert.deepEqual(parseWhere(['active=true']), { active: true });
  assert.deepEqual(parseWhere(['note=null']), { note: null });
  assert.deepEqual(parseWhere(['note!=null']), { note: { ne: null } });
  assert.deepEqual(parseWhere(['code="007"']), { code: '007' });
  // A leading zero is not a JSON number, so it stays text without quotes too.
  assert.deepEqual(parseWhere(['code=007']), { code: '007' });
  assert.equal(parseValue('"true"'), 'true');
  assert.equal(parseValue('1e3'), 1000);
});

test('contains and starts-with always search for text', () => {
  assert.deepEqual(parseWhere(['code~12']), { code: { contains: '12' } });
  assert.deepEqual(parseWhere(['code^=0']), { code: { startsWith: '0' } });
});

test('a list is "in", and with != "notIn"', () => {
  assert.deepEqual(parseWhere(['status=[open,done]']), {
    status: { in: ['open', 'done'] }
  });
  assert.deepEqual(parseWhere(['id!=[1, 2,3]']), { id: { notIn: [1, 2, 3] } });
  assert.throws(() => parseWhere(['price>[1,2]']), /a list goes with = or !=/);
  assert.throws(() => parseWhere(['status=[]']), /the list is empty/);
});

test('the value may hold operator characters', () => {
  assert.deepEqual(parseWhere(['note=a<b']), { note: 'a<b' });
  assert.deepEqual(parseWhere(['note=x>=y']), { note: 'x>=y' });
  assert.deepEqual(parseWhere(['title~2=1']), { title: { contains: '2=1' } });
  assert.deepEqual(parseWhere(['url=https://a.b/?q=1']), { url: 'https://a.b/?q=1' });
  assert.deepEqual(parseWhere(['note=']), { note: '' });
});

test('a relation path names a column of the other table', () => {
  assert.deepEqual(parseWhere(['product.name=Margherita']), {
    'product.name': 'Margherita'
  });
});

test('repeated flags all have to hold, and merge on one column', () => {
  assert.deepEqual(parseWhere(['status=open', 'price<30000']), {
    status: 'open',
    price: { lt: 30000 }
  });
  assert.deepEqual(parseWhere(['price>=10', 'price<20']), {
    price: { gte: 10, lt: 20 }
  });
  assert.deepEqual(parseWhere(['price=10', 'price!=null']), {
    price: { eq: 10, ne: null }
  });
  assert.throws(() => parseWhere(['price>1', 'price>2']), /"gt" twice/);
  assert.throws(() => parseWhere(['status=open', 'status=done']), /"eq" twice/);
});

test('raw JSON is taken as is, and merges with the shorthand', () => {
  assert.deepEqual(parseWhere(['{"price":{"lt":30000},"status":"open"}']), {
    price: { lt: 30000 },
    status: 'open'
  });
  assert.deepEqual(parseWhere(['{"price":{"lt":30000}}', 'price>=10']), {
    price: { lt: 30000, gte: 10 }
  });
  assert.throws(() => parseWhere(['{"price":']), /not valid JSON/);
  assert.throws(() => parseWhere(['{}x']), /not valid JSON/);
});

test('something that is not a condition is refused with the syntax', () => {
  assert.throws(() => parseWhere(['open']), /is not a condition/);
  assert.throws(() => parseWhere(['=open']), /is not a condition/);
  assert.throws(() => parseWhere(['1abc=2']), /is not a condition/);
});
