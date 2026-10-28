import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = JSON.parse(
  readFileSync(new URL('./chromium-userns-seccomp.json', import.meta.url), 'utf8'),
);
const cloneNewUser = 0x10000000;

test('Chromium user namespace extension preserves Docker default-deny seccomp', () => {
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  assert.equal(profile.defaultErrnoRet, 1);

  for (const syscall of ['clone', 'unshare']) {
    const allowRules = profile.syscalls.filter(
      (rule) => rule.action === 'SCMP_ACT_ALLOW' && rule.names?.includes(syscall),
    );
    const userNamespaceRule = profile.syscalls.find(
      (rule) =>
        rule.action === 'SCMP_ACT_ALLOW' &&
        rule.names?.includes(syscall) &&
        rule.args?.some(
          (arg) =>
            arg.index === 0 &&
            arg.value === cloneNewUser &&
            arg.valueTwo === cloneNewUser &&
            arg.op === 'SCMP_CMP_MASKED_EQ',
        ),
    );
    assert.ok(userNamespaceRule, `${syscall} must allow the CLONE_NEWUSER flag`);
    assert.equal(userNamespaceRule.args.length, 1);
    assert.equal(userNamespaceRule.args[0].value, cloneNewUser);
    assert.equal(userNamespaceRule.args[0].valueTwo, cloneNewUser);
    for (const rule of allowRules) {
      const constrainedByArguments = Array.isArray(rule.args) && rule.args.length > 0;
      const requiresSysAdmin = rule.includes?.caps?.includes('CAP_SYS_ADMIN');
      assert.ok(
        constrainedByArguments || requiresSysAdmin,
        `${syscall} allow rules must be argument constrained or require CAP_SYS_ADMIN`,
      );
    }
  }
});

test('GUI Chromium wrapper selects the user namespace sandbox without disabling sandboxing', () => {
  const wrapper = readFileSync(new URL('./chromium-wrapper.sh', import.meta.url), 'utf8');
  const profilePatch = readFileSync(new URL('./gui-profile.patch.yml', import.meta.url), 'utf8');
  assert.match(wrapper, /--disable-setuid-sandbox/u);
  assert.match(wrapper, /--force-renderer-accessibility/u);
  assert.doesNotMatch(wrapper, /--no-sandbox/u);
  assert.match(profilePatch, /browserPath:\s*\/usr\/local\/bin\/deepseekbot-chromium/u);
});

test('reviewed Chromium chroot and PID-only clone exceptions keep other namespaces excluded', () => {
  assert.ok(
    profile.syscalls.some(
      (rule) =>
        rule.names?.includes('chroot') &&
        rule.action === 'SCMP_ACT_ALLOW' &&
        !rule.includes &&
        !rule.args,
    ),
  );
  for (const index of [0, 1]) {
    const rule = profile.syscalls.find(
      (rule) =>
        rule.names?.includes('clone') &&
        rule.args?.some(
          (arg) => arg.index === index && arg.value === 0x7e020080 && arg.valueTwo === 0x20000000,
        ),
    );
    assert.ok(rule);
    assert.deepEqual(index === 0 ? rule.excludes : rule.includes, { arches: ['s390', 's390x'] });
    const arg = rule.args[0];
    assert.equal(arg.op, 'SCMP_CMP_MASKED_EQ');
    const matches = (flags) => (flags & arg.value) === arg.valueTwo;
    assert.equal(matches(0x20000000 | 17), true);
    for (const flag of [0x80, 0x20000, 0x2000000, 0x4000000, 0x8000000, 0x10000000, 0x40000000])
      assert.equal(matches(0x20000000 | flag), false);
    assert.equal(matches(17), false);
  }
});
