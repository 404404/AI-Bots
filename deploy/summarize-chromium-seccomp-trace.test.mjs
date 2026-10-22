import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeChromiumSeccompTrace } from './summarize-chromium-seccomp-trace.mjs';

test('Chromium seccomp trace reports bounded syscall and SIGTRAP context without arguments or PIDs', () => {
  const trace = [
    '101 openat(AT_FDCWD, "/tmp/private-profile/secret", O_RDONLY) = -1 ENOENT (No such file or directory)',
    '[pid 101] io_uring_setup(8, {flags=0}) = -1 EPERM (Operation not permitted)',
    '[pid 101] --- SIGTRAP {si_signo=SIGTRAP, si_code=SI_KERNEL} ---',
    '[pid 202] clone3({flags=CLONE_NEWUSER}) = -1 ENOSYS (Function not implemented)',
    '[pid 202] +++ killed by SIGTRAP +++',
    '[pid 303] clone(child_stack=NULL, flags=CLONE_NEWPID|SIGCHLD, child_tidptr=NULL) = -1 EPERM (Operation not permitted)',
    '[pid 303] --- SIGTRAP {si_signo=SIGTRAP, si_code=SI_KERNEL} ---',
  ].join('\n');

  const summary = summarizeChromiumSeccompTrace(trace, true);

  assert.deepEqual(summary, {
    schemaVersion: 1,
    traceAttached: true,
    failedSyscalls: [
      { name: 'clone', errno: 'EPERM', count: 1 },
      { name: 'clone3', errno: 'ENOSYS', count: 1 },
      { name: 'io_uring_setup', errno: 'EPERM', count: 1 },
      { name: 'openat', errno: 'ENOENT', count: 1 },
    ],
    sigtrapContexts: [
      {
        processIndex: 1,
        signal: 'delivered',
        precedingFailedSyscalls: ['openat:ENOENT', 'io_uring_setup:EPERM'],
        precedingCloneCalls: [],
      },
      {
        processIndex: 2,
        signal: 'terminated',
        precedingFailedSyscalls: ['clone3:ENOSYS'],
        precedingCloneCalls: [
          { syscall: 'clone3', errno: 'ENOSYS', namespaceFlags: ['CLONE_NEWUSER'] },
        ],
      },
      {
        processIndex: 3,
        signal: 'delivered',
        precedingFailedSyscalls: ['clone:EPERM'],
        precedingCloneCalls: [
          { syscall: 'clone', errno: 'EPERM', namespaceFlags: ['CLONE_NEWPID'] },
        ],
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(summary), /private-profile|secret|101|202/u);
});
