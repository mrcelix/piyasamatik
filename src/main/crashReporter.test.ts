import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insertMock, getSessionMock } = vi.hoisted(() => ({
  insertMock: vi.fn().mockResolvedValue({ error: null }),
  getSessionMock: vi.fn().mockResolvedValue({ data: { session: null } }),
}));

vi.mock('electron', () => ({ app: { getVersion: () => '1.2.3' } }));
vi.mock('./auth', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    from: () => ({ insert: insertMock }),
  },
}));

// vi.mock calls above are hoisted above this import by vitest's transform,
// so the module under test picks up the mocked './auth' and 'electron'.
import { reportError, setCrashReportingEnabled } from './crashReporter';

describe('reportError', () => {
  beforeEach(() => {
    insertMock.mockClear();
    setCrashReportingEnabled(true);
  });

  it('inserts a row with the expected shape', async () => {
    await reportError('main', 'boom', 'stack trace', 'startup');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'main',
        message: 'boom',
        stack: 'stack trace',
        context: 'startup',
        app_version: '1.2.3',
      })
    );
  });

  it('does nothing when reporting is disabled', async () => {
    setCrashReportingEnabled(false);
    await reportError('main', 'unique-disabled-message');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('swallows a failed insert instead of throwing', async () => {
    insertMock.mockRejectedValueOnce(new Error('network down'));
    await expect(reportError('main', 'unique-network-message')).resolves.toBeUndefined();
  });

  it('de-dupes identical (source, message) pairs within the same run', async () => {
    await reportError('renderer', 'unique-dedupe-message');
    await reportError('renderer', 'unique-dedupe-message');
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
