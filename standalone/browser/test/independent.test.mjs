import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeTarget,parseTargetRules,canonicalTarget} from '../src/policy.mjs';

const origin='http://fixture.test:8081';
test('IPv6 canonical forms map to the same allowed address while a mixed answer fails closed',async()=>{
 const rules=parseTargetRules({[origin]:{addresses:['2001:4860:4860::8888']}});
 const ok=await authorizeTarget(`${origin}/path`,rules,async()=>[{address:'2001:4860:4860:0:0:0:0:8888',family:6}]);assert.equal(ok.address,'2001:4860:4860::8888');
 await assert.rejects(authorizeTarget(origin,rules,async()=>[{address:'2001:4860:4860::8888',family:6},{address:'::1',family:6}]),{code:'target-address-denied'});
});

test('private permission stays scoped to an exact host and port and cannot authorize metadata',async()=>{
 const rules=parseTargetRules({[origin]:{addresses:['172.31.240.10'],allowPrivate:true}});let calls=0;const lookup=async()=>{calls++;return [{address:'172.31.240.10',family:4}];};
 await assert.rejects(authorizeTarget('http://fixture.test:8082/',rules,lookup),{code:'target-origin-denied'});assert.equal(calls,0);
 await assert.rejects(authorizeTarget(origin,rules,async()=>[{address:'169.254.169.254',family:4}]),{code:'target-address-denied'});
 for(const value of ['ws://fixture.test:8081/','http://user:pass@fixture.test:8081/'])assert.throws(()=>canonicalTarget(value));
});

test('empty and excessive DNS replies are refused before an address is selected',async()=>{
 const rules=parseTargetRules({[origin]:{addresses:['172.31.240.10'],allowPrivate:true}});
 for(const records of [[],Array.from({length:17},()=>({address:'172.31.240.10',family:4}))])await assert.rejects(authorizeTarget(origin,rules,async()=>records),{code:'target-dns-denied'});
});
