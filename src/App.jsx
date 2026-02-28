import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import Swal from 'sweetalert2';
import moment from 'moment';
import isEqual from 'lodash/isEqual';
import Lottie from 'react-lottie-player';
import withReactContent from 'sweetalert2-react-content';
import JSON5 from 'json5';

import runningLottie   from './14470-phone-running.json';
import robotLottie     from './10178-c-bot.json';
import robotDizzyLottie from './13680-robot-call.json';

const { isDev } = window;
const electron = window.require('@electron/remote');
const {
  initInstautoDb, initInstauto, runBotNormalMode,
  runBotUnfollowAllUnknown, runBotUnfollowNonMutualFollowers,
  runBotUnfollowOldFollowed, runBotUnfollowUserList,
  runBotFollowUserList, cleanupInstauto, checkHaveCookies,
  deleteCookies, getInstautoData, runTestCode,
} = electron.require('./electron');
const { store: configStore, defaults: configDefaults } = electron.require('./store');

const ReactSwal = withReactContent(Swal);

// ── Swal custom theme ─────────────────────────────────────────────────────────
const swalDefaults = {
  background: '#13161d',
  color: '#e8eaf0',
  confirmButtonColor: '#6c63ff',
  cancelButtonColor: '#252a38',
  customClass: {
    popup: 'swal-dark',
  },
};

const cleanupAccounts = (accounts) => accounts.map(u => u.replace(/^@/g, ''));

function safeSetConfig(key, val) {
  configStore.set(key, val !== undefined ? val : null);
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
const Icon = {
  Play:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  Stop:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>,
  Logout:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Settings: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Logs:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Help:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  X:        () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  Reset:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.02"/></svg>,
  Bot:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  Users:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Stats:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Unfollow: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="10" x2="16" y2="10"/></svg>,
  Follow:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
};

// ── Tag Input ─────────────────────────────────────────────────────────────────
const TagInput = memo(({ values, onChange, placeholder, hasWarning }) => {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef();

  const addTags = useCallback((raw) => {
    const newTags = raw.split(/[\s,]+/)
      .map(t => t.trim())
      .filter(t => t && !t.startsWith('#') && !values.includes(t));
    if (newTags.length) onChange([...values, ...newTags]);
  }, [values, onChange]);

  const onKeyDown = useCallback((e) => {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && inputVal.trim()) {
      e.preventDefault();
      addTags(inputVal);
      setInputVal('');
    } else if (e.key === 'Backspace' && !inputVal && values.length) {
      onChange(values.slice(0, -1));
    }
  }, [inputVal, values, onChange, addTags]);

  const onPaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    addTags(text);
  }, [addTags]);

  return (
    <div
      className={`tag-input-wrapper${hasWarning ? ' warn' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v) => (
        <span key={v} className="tag">
          {v}
          <button
            className="tag-remove"
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(values.filter(x => x !== v)); }}
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => { if (inputVal.trim()) { addTags(inputVal); setInputVal(''); } }}
        placeholder={values.length === 0 ? placeholder : ''}
      />
    </div>
  );
});

// ── Log Viewer ────────────────────────────────────────────────────────────────
const LogView = memo(({ logs, style } = {}) => {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div ref={ref} className="log-viewer" style={style}>
      {logs.length === 0 && <span style={{ color: 'var(--text-muted)' }}>No logs yet…</span>}
      {logs.map(({ args, level, time }, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="log-line">
          <span className="log-time">{moment(time).format('HH:mm:ss')}</span>
          <span className={`log-msg${level === 'warn' ? ' warn' : level === 'error' ? ' error' : ''}`}>
            {args.map(a => String(a)).join(' ')}
          </span>
        </div>
      ))}
    </div>
  );
});

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = memo(({ label, today, total }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-row">
      <span className="stat-value">{today ?? '—'}</span>
      <span className="stat-sub">today</span>
    </div>
    <div className="stat-row">
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{total ?? '—'}</span>
      <span className="stat-sub">total</span>
    </div>
  </div>
));

// ── Panel (right side sheet) ──────────────────────────────────────────────────
const Panel = memo(({ title, onClose, footer, children }) => (
  <div className="panel-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <button className="btn-icon" type="button" onClick={onClose}><Icon.X /></button>
      </div>
      <div className="panel-body">{children}</div>
      {footer && <div className="panel-footer">{footer}</div>}
    </div>
  </div>
));

// ── Modal dialog ──────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, onConfirm, confirmLabel, children }) => {
  const [accounts, setAccounts] = useState([]);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children || (
          <div className="form-group">
            <label className="form-label">Accounts (press Enter between each)</label>
            <TagInput values={accounts} onChange={setAccounts} placeholder="@account1 @account2" />
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={() => onConfirm(accounts)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

// ── Advanced Settings Panel ───────────────────────────────────────────────────
const AdvancedSettings = memo(({ advancedSettings, onChange, dryRun, setDryRun, instantStart, setInstantStart, onClose }) => {
  const [txt, setTxt] = useState();
  const [parsed, setParsed] = useState(advancedSettings);

  const optsData = {
    dontUnfollowUntilDaysElapsed: 'Auto-unfollow after this many days',
    followUserMinFollowing:       'Skip users following less than this',
    followUserMinFollowers:       'Skip users with fewer followers than this',
    followUserMaxFollowers:       'Skip users with more followers than this',
    followUserMaxFollowing:       'Skip users following more than this',
    followUserRatioMin:           'Skip users with followers/following ratio below this',
    followUserRatioMax:           'Skip users with followers/following ratio above this',
    maxFollowsPerHour:            'Max follow/unfollow ops per hour (too high → Action Blocked)',
    maxFollowsPerDay:             'Max follow/unfollow ops per 24h (too high → Action Blocked)',
    maxLikesPerUser:              'Like up to N photos per user profile (0 = disabled)',
    enableFollowUnfollow:         'Enable follow/unfollow mode',
    maxLikesPerDay:               'Max photo likes per 24h (too high → Action Blocked)',
    runAtHour:                    'Daily repeat hour (24h format)',
    userAgent:                    'Custom browser user agent string',
  };

  const onTextChange = useCallback((e) => {
    const val = e.target.value;
    setTxt(val);
    try { setParsed(JSON5.parse(val)); }
    catch { setParsed(undefined); }
  }, []);

  const onSave = useCallback(() => {
    if (!parsed) return;
    onChange(parsed);
    setTxt(undefined);
    onClose();
  }, [parsed, onChange, onClose]);

  const onReset = useCallback(() => {
    setTxt(undefined);
    setParsed(advancedSettings);
  }, [advancedSettings]);

  const fmt = v => (v != null ? String(v) : 'unset');

  return (
    <Panel
      title="Advanced Settings"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onReset}><Icon.Reset /> Reset</button>
          <button className="btn btn-primary" type="button" disabled={!parsed} onClick={onSave}><Icon.Check /> Save &amp; Close</button>
        </>
      }
    >
      <div className="lottie-wrap" style={{ marginBottom: 16 }}>
        <Lottie loop play animationData={robotDizzyLottie} style={{ width: 70, height: 70 }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        {Object.entries(parsed || advancedSettings).map(([key, value]) => {
          const def = configDefaults[key];
          const changed = !isEqual(def, value);
          return (
            <div key={key} className="setting-row">
              <div>
                <div className="setting-key">{key}</div>
                <div className="setting-desc">{optsData[key]}</div>
              </div>
              <span className={`setting-value${changed ? ' changed' : ''}`}>{fmt(value)}</span>
            </div>
          );
        })}
      </div>

      <div className="form-group">
        <label className="form-label">Edit settings (JSON5)</label>
        <textarea
          className={`form-input form-textarea${!parsed ? ' invalid' : ''}`}
          spellCheck={false}
          onChange={onTextChange}
          value={txt != null ? txt : JSON5.stringify(advancedSettings, null, 2)}
        />
        {!parsed && <span style={{ color: 'var(--danger)', fontSize: 12 }}>JSON syntax error — please fix before saving.</span>}
      </div>

      <div className="divider" />

      <label className="form-checkbox" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
        Dry run — simulate actions without executing them
      </label>
      <label className="form-checkbox">
        <input type="checkbox" checked={instantStart} onChange={e => setInstantStart(e.target.checked)} />
        Start immediately (skip waiting until runAtHour)
      </label>
    </Panel>
  );
});

// ── Main App ──────────────────────────────────────────────────────────────────
const App = memo(() => {
  const [advancedSettings, setAdvancedSettings] = useState(() => ({
    userAgent:                    configStore.get('userAgent'),
    maxFollowsPerDay:             configStore.get('maxFollowsPerDay'),
    maxFollowsPerHour:            configStore.get('maxFollowsPerHour'),
    maxLikesPerDay:               configStore.get('maxLikesPerDay'),
    maxLikesPerUser:              configStore.get('maxLikesPerUser'),
    enableFollowUnfollow:         configStore.get('enableFollowUnfollow'),
    followUserRatioMin:           configStore.get('followUserRatioMin'),
    followUserRatioMax:           configStore.get('followUserRatioMax'),
    followUserMaxFollowers:       configStore.get('followUserMaxFollowers'),
    followUserMaxFollowing:       configStore.get('followUserMaxFollowing'),
    followUserMinFollowers:       configStore.get('followUserMinFollowers'),
    followUserMinFollowing:       configStore.get('followUserMinFollowing'),
    dontUnfollowUntilDaysElapsed: configStore.get('dontUnfollowUntilDaysElapsed'),
    runAtHour:                    configStore.get('runAtHour'),
  }));

  function setAdvancedSetting(key, value) {
    setAdvancedSettings(s => ({ ...s, [key]: value }));
  }

  // Persist advanced settings
  useEffect(() => safeSetConfig('userAgent', advancedSettings.userAgent), [advancedSettings.userAgent]);
  useEffect(() => safeSetConfig('maxFollowsPerDay', advancedSettings.maxFollowsPerDay), [advancedSettings.maxFollowsPerDay]);
  useEffect(() => safeSetConfig('maxFollowsPerHour', advancedSettings.maxFollowsPerHour), [advancedSettings.maxFollowsPerHour]);
  useEffect(() => safeSetConfig('maxLikesPerDay', advancedSettings.maxLikesPerDay), [advancedSettings.maxLikesPerDay]);
  useEffect(() => safeSetConfig('maxLikesPerUser', advancedSettings.maxLikesPerUser), [advancedSettings.maxLikesPerUser]);
  useEffect(() => safeSetConfig('enableFollowUnfollow', advancedSettings.enableFollowUnfollow), [advancedSettings.enableFollowUnfollow]);
  useEffect(() => safeSetConfig('followUserRatioMin', advancedSettings.followUserRatioMin), [advancedSettings.followUserRatioMin]);
  useEffect(() => safeSetConfig('followUserRatioMax', advancedSettings.followUserRatioMax), [advancedSettings.followUserRatioMax]);
  useEffect(() => safeSetConfig('followUserMaxFollowers', advancedSettings.followUserMaxFollowers), [advancedSettings.followUserMaxFollowers]);
  useEffect(() => safeSetConfig('followUserMaxFollowing', advancedSettings.followUserMaxFollowing), [advancedSettings.followUserMaxFollowing]);
  useEffect(() => safeSetConfig('followUserMinFollowers', advancedSettings.followUserMinFollowers), [advancedSettings.followUserMinFollowers]);
  useEffect(() => safeSetConfig('followUserMinFollowing', advancedSettings.followUserMinFollowing), [advancedSettings.followUserMinFollowing]);
  useEffect(() => safeSetConfig('dontUnfollowUntilDaysElapsed', advancedSettings.dontUnfollowUntilDaysElapsed), [advancedSettings.dontUnfollowUntilDaysElapsed]);
  useEffect(() => safeSetConfig('runAtHour', advancedSettings.runAtHour), [advancedSettings.runAtHour]);

  const [haveCookies, setHaveCookies]     = useState(false);
  const [dryRun, setDryRun]               = useState(isDev);
  const [running, setRunning]             = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [logsVisible, setLogsVisible]     = useState(false);
  const [username, setUsername]           = useState('');
  const [password, setPassword]           = useState('');
  const [logs, setLogs]                   = useState([]);
  const [instautoData, setInstautoData]   = useState();
  const [shouldPlayAnim, setShouldPlayAnim] = useState(true);
  const [instantStart, setInstantStart]   = useState(true);
  const [unfollowDialog, setUnfollowDialog] = useState(false);
  const [followDialog, setFollowDialog]   = useState(false);
  const [activeTab, setActiveTab]         = useState('home'); // home | logs | stats

  const [skipPrivate, setSkipPrivate]     = useState(configStore.get('skipPrivate'));
  const [usersToFollowFollowersOf, setUsersToFollowFollowersOf] = useState(configStore.get('usersToFollowFollowersOf'));
  const [currentUsername, setCurrentUsername] = useState(configStore.get('currentUsername'));

  useEffect(() => (currentUsername ? safeSetConfig('currentUsername', currentUsername) : configStore.delete('currentUsername')), [currentUsername]);
  useEffect(() => safeSetConfig('skipPrivate', skipPrivate), [skipPrivate]);
  useEffect(() => safeSetConfig('usersToFollowFollowersOf', usersToFollowFollowersOf), [usersToFollowFollowersOf]);

  useEffect(() => {
    if (running) {
      const t = setTimeout(() => setShouldPlayAnim(false), isDev ? 5000 : 60000);
      return () => clearTimeout(t);
    }
    setShouldPlayAnim(true);
    return undefined;
  }, [running]);

  const isLoggedIn = !!(currentUsername && haveCookies);
  const fewAccounts = usersToFollowFollowersOf.length < 5;

  async function updateCookiesState() {
    setHaveCookies(await checkHaveCookies());
  }

  const refreshInstautoData = useCallback(() => setInstautoData(getInstautoData()), []);

  useEffect(() => {
    updateCookiesState();
  }, []);

  useEffect(() => {
    (async () => {
      if (!isLoggedIn) return;
      await initInstautoDb(currentUsername);
      refreshInstautoData();
    })().catch(console.error);
  }, [currentUsername, isLoggedIn, refreshInstautoData]);

  const onLogoutClick = useCallback(async () => {
    await deleteCookies();
    await updateCookiesState();
    setCurrentUsername(undefined);
    cleanupInstauto();
    refreshInstautoData();
  }, [refreshInstautoData]);

  const startInstautoAction = useCallback(async (action) => {
    if (running) {
      const result = await Swal.fire({
        ...swalDefaults,
        title: 'Stop the bot?',
        text: 'This will terminate the current session. Followed/unfollowed history is preserved.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Stop bot',
        cancelButtonText: 'Keep running',
      });
      if (result.value) electron.app.quit();
      return;
    }

    if (usersToFollowFollowersOf.length < 1) {
      await Swal.fire({ ...swalDefaults, icon: 'error', text: 'Add at least 1 target account.' });
      return;
    }

    if (!isLoggedIn && (username.length < 1 || password.length < 4)) {
      await Swal.fire({ ...swalDefaults, icon: 'error', text: 'Enter your Instagram username and password.' });
      return;
    }

    if (fewAccounts) {
      const { value } = await Swal.fire({ ...swalDefaults, icon: 'warning', text: 'Recommended: at least 5 target accounts for best results.', showCancelButton: true, confirmButtonText: 'Run anyway' });
      if (!value) return;
    }

    setLogs([]);
    setRunning(true);

    function log(level, ...args) {
      console[level](...args);
      setLogs(l => [...l, { time: new Date(), level, args }]);
    }

    const logger = {
      log:   (...a) => log('log', ...a),
      error: (...a) => log('error', ...a),
      warn:  (...a) => log('warn', ...a),
      info:  (...a) => log('info', ...a),
      debug: (...a) => log('debug', ...a),
    };

    try {
      if (isLoggedIn) {
        await initInstautoDb(currentUsername);
      } else {
        await deleteCookies();
        setCurrentUsername(username);
        await initInstautoDb(username);
      }
      refreshInstautoData();

      await initInstauto({
        userAgent:                    advancedSettings.userAgent,
        dontUnfollowUntilDaysElapsed: advancedSettings.dontUnfollowUntilDaysElapsed,
        maxFollowsPerHour:            advancedSettings.maxFollowsPerHour,
        maxFollowsPerDay:             advancedSettings.maxFollowsPerDay,
        maxLikesPerDay:               advancedSettings.maxLikesPerDay,
        followUserRatioMin:           advancedSettings.followUserRatioMin,
        followUserRatioMax:           advancedSettings.followUserRatioMax,
        followUserMaxFollowers:       advancedSettings.followUserMaxFollowers,
        followUserMaxFollowing:       advancedSettings.followUserMaxFollowing,
        followUserMinFollowers:       advancedSettings.followUserMinFollowers,
        followUserMinFollowing:       advancedSettings.followUserMinFollowing,
        excludeUsers:                 [],
        dryRun,
        username,
        password,
        logger,
      });

      await action();
    } catch (err) {
      logger.error('Failed to run', err);
      await ReactSwal.fire({
        ...swalDefaults,
        icon: 'error',
        title: 'Bot error',
        html: (
          <div style={{ textAlign: 'left', color: '#ff7a8a', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
            {err.message}
          </div>
        ),
      });
      if (!isDev) await onLogoutClick();
    } finally {
      setRunning(false);
      cleanupInstauto();
      refreshInstautoData();
    }
  }, [advancedSettings, currentUsername, dryRun, fewAccounts, isLoggedIn, onLogoutClick, password, refreshInstautoData, running, username, usersToFollowFollowersOf.length]);

  const onStartPress = useCallback(async () => {
    await startInstautoAction(async () => {
      await runBotNormalMode({
        usernames:           cleanupAccounts(usersToFollowFollowersOf),
        ageInDays:           advancedSettings.dontUnfollowUntilDaysElapsed,
        skipPrivate,
        runAtHour:           advancedSettings.runAtHour,
        enableFollowUnfollow: advancedSettings.enableFollowUnfollow,
        maxLikesPerUser:     advancedSettings.maxLikesPerUser,
        maxFollowsTotal:     advancedSettings.maxFollowsPerDay,
        instantStart,
      });
    });
  }, [advancedSettings, instantStart, skipPrivate, startInstautoAction, usersToFollowFollowersOf]);

  const onUnfollowNonMutual    = useCallback(() => startInstautoAction(() => runBotUnfollowNonMutualFollowers()), [startInstautoAction]);
  const onUnfollowAllUnknown   = useCallback(() => startInstautoAction(() => runBotUnfollowAllUnknown()), [startInstautoAction]);
  const onUnfollowOld          = useCallback(() => startInstautoAction(() => runBotUnfollowOldFollowed({ ageInDays: advancedSettings.dontUnfollowUntilDaysElapsed })), [advancedSettings.dontUnfollowUntilDaysElapsed, startInstautoAction]);
  const onUnfollowList         = useCallback(async (accs) => { const c = cleanupAccounts(accs); if (!c.length) return; setUnfollowDialog(false); await startInstautoAction(() => runBotUnfollowUserList({ usersToUnfollow: c })); }, [startInstautoAction]);
  const onFollowList           = useCallback(async (accs) => { const c = cleanupAccounts(accs); if (!c.length) return; setFollowDialog(false); await startInstautoAction(() => runBotFollowUserList({ users: c, skipPrivate })); }, [skipPrivate, startInstautoAction]);
  const onRunTestCode          = useCallback(() => startInstautoAction(() => runTestCode()), [startInstautoAction]);

  const statusLabel = running
    ? (dryRun ? 'dry' : 'running')
    : 'idle';

  const statusText = { idle: 'Idle', running: 'Running', dry: 'Dry Run', error: 'Error' };

  const navItems = [
    { id: 'home',  label: 'Dashboard',  icon: <Icon.Bot />  },
    { id: 'stats', label: 'Statistics', icon: <Icon.Stats /> },
    { id: 'logs',  label: 'Logs',       icon: <Icon.Logs />  },
  ];

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-icon">🤖</div>
          InstaBot
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>v1.11</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`status-badge ${statusLabel}`}>{statusText[statusLabel]}</span>
          {dryRun && !running && <span className="status-badge dry">Dry Run</span>}
        </div>

        <div className="topbar-actions">
          <button className="btn-icon" data-tooltip="Advanced Settings" type="button" onClick={() => setAdvancedVisible(true)}>
            <Icon.Settings />
          </button>
          {isLoggedIn && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={onLogoutClick}>
              <Icon.Logout /> {currentUsername}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="main-content">
        {/* ── Sidebar ── */}
        <div className="sidebar">
          {navItems.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-btn${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {icon} {label}
            </button>
          ))}

          <div className="sidebar-section-label">Quick Actions</div>

          <button type="button" className="sidebar-btn" disabled={running} onClick={onUnfollowOld} style={{ opacity: running ? 0.4 : 1 }}>
            <Icon.Unfollow /> Unfollow old
          </button>
          <button type="button" className="sidebar-btn" disabled={running} onClick={onUnfollowNonMutual} style={{ opacity: running ? 0.4 : 1 }}>
            <Icon.Unfollow /> Unfollow non-mutual
          </button>
          <button type="button" className="sidebar-btn" disabled={running} onClick={onUnfollowAllUnknown} style={{ opacity: running ? 0.4 : 1 }}>
            <Icon.Unfollow /> Unfollow unknown
          </button>
          <button type="button" className="sidebar-btn" disabled={running} onClick={() => setUnfollowDialog(true)} style={{ opacity: running ? 0.4 : 1 }}>
            <Icon.Unfollow /> Unfollow list…
          </button>
          <button type="button" className="sidebar-btn" disabled={running} onClick={() => setFollowDialog(true)} style={{ opacity: running ? 0.4 : 1 }}>
            <Icon.Follow /> Follow list…
          </button>
          {isDev && (
            <button type="button" className="sidebar-btn" onClick={onRunTestCode}>
              ⚗️ Test code
            </button>
          )}
        </div>

        {/* ── Page ── */}
        <div className="page">
          {/* ── HOME TAB ── */}
          {activeTab === 'home' && (
            <>
              {running ? (
                <div className="card">
                  <div className="running-view">
                    <Lottie
                      loop
                      play={shouldPlayAnim}
                      animationData={runningLottie}
                      style={{ width: 100, height: 100 }}
                    />
                    <div className="running-title">Bot is running {dryRun ? '(dry run)' : ''}</div>
                    <p className="running-desc">
                      Keep the app open and your computer awake. Don&apos;t close the Instagram window.&nbsp;🤖
                    </p>
                    <button className="btn btn-danger" type="button" onClick={onStartPress}>
                      <Icon.Stop /> Stop bot
                    </button>
                    <LogView logs={logs} style={{ height: 120, width: '100%', maxWidth: 520 }} />
                  </div>
                </div>
              ) : (
                <>
                  {/* Account */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Account</span>
                    </div>

                    {isLoggedIn ? (
                      <div className="login-banner logged-in">
                        <span>✓</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>Logged in as <b>@{currentUsername}</b></div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Session saved. Ready to run.</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} type="button" onClick={onLogoutClick}>
                          <Icon.Logout /> Log out
                        </button>
                      </div>
                    ) : (
                      <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Username</label>
                          <input
                            className={`form-input${username.length < 1 ? ' invalid' : ''}`}
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="your_username"
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Password</label>
                          <input
                            className={`form-input${password.length < 4 ? ' invalid' : ''}`}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            type="password"
                            placeholder="••••••••"
                          />
                          <span className="form-hint">Password is never stored.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Target Accounts */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Target Accounts</span>
                      {fewAccounts && (
                        <span style={{ fontSize: 11, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          ⚠ Add at least 5
                        </span>
                      )}
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <TagInput
                        values={usersToFollowFollowersOf}
                        onChange={setUsersToFollowFollowersOf}
                        hasWarning={fewAccounts}
                        placeholder="influencer1  influencer2  …"
                      />
                      <span className="form-hint">
                        Bot follows their recent followers. Use influencers in your niche (100k+ followers). Press <b>Enter</b> or <b>Space</b> to add.
                      </span>
                    </div>

                    <div className="divider" />

                    <div style={{ display: 'flex', gap: 24 }}>
                      <label className="form-checkbox">
                        <input type="checkbox" checked={!skipPrivate} onChange={e => setSkipPrivate(!e.target.checked)} />
                        Follow private accounts
                      </label>
                      <label className="form-checkbox">
                        <input type="checkbox" checked={advancedSettings.maxLikesPerUser > 0} onChange={e => setAdvancedSetting('maxLikesPerUser', e.target.checked ? 2 : 0)} />
                        Like a few photos after following
                      </label>
                    </div>
                  </div>

                  {/* Launch */}
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, maxWidth: 440 }}>
                        Bot will run immediately, then repeat every day at <b style={{ color: 'var(--text-primary)' }}>{advancedSettings.runAtHour}:00</b>. Run on the same WiFi as your Instagram app. <b style={{ color: 'var(--warn)' }}>No VPN.</b>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
                        <Lottie loop play animationData={robotLottie} style={{ width: 50, height: 50 }} />
                        <button className="btn btn-success" style={{ padding: '10px 28px', fontSize: 15 }} type="button" onClick={onStartPress}>
                          <Icon.Play /> Start bot
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── STATS TAB ── */}
          {activeTab === 'stats' && (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>Statistics</div>
              {instautoData ? (
                <div className="card-grid" style={{ gap: 14 }}>
                  <StatCard label="Followed" today={instautoData.numFollowedLastDay} total={instautoData.numTotalFollowedUsers} />
                  <StatCard label="Unfollowed" today={instautoData.numUnfollowedLastDay} total={instautoData.numTotalUnfollowedUsers} />
                  <StatCard label="Liked" today={instautoData.numLikedLastDay} total={instautoData.numTotalLikedPhotos} />
                </div>
              ) : (
                <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  {isLoggedIn ? 'No data yet — run the bot first.' : 'Log in to see statistics.'}
                </div>
              )}
            </>
          )}

          {/* ── LOGS TAB ── */}
          {activeTab === 'logs' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>Logs</span>
                {logs.length > 0 && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setLogs([])}>Clear</button>
                )}
              </div>
              <LogView logs={logs} style={{ height: 'calc(100vh - 200px)' }} />
            </>
          )}
        </div>
      </div>

      {/* ── Panels & Modals ── */}
      {advancedVisible && (
        <AdvancedSettings
          dryRun={dryRun}
          setDryRun={setDryRun}
          advancedSettings={advancedSettings}
          onChange={setAdvancedSettings}
          instantStart={instantStart}
          setInstantStart={setInstantStart}
          onClose={() => setAdvancedVisible(false)}
        />
      )}

      {logsVisible && (
        <Panel title="Logs" onClose={() => setLogsVisible(false)}>
          <LogView logs={logs} style={{ height: '100%' }} />
        </Panel>
      )}

      {unfollowDialog && (
        <Modal
          title="Unfollow accounts"
          confirmLabel="Unfollow"
          onClose={() => setUnfollowDialog(false)}
          onConfirm={onUnfollowList}
        />
      )}

      {followDialog && (
        <Modal
          title="Follow accounts"
          confirmLabel="Follow"
          onClose={() => setFollowDialog(false)}
          onConfirm={onFollowList}
        />
      )}
    </div>
  );
});

export default App;