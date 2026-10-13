(() => {
  if (window.__VMP_LOADED__) return;
  window.__VMP_LOADED__ = true;

  const ROOT_ID = 'vmp-mini-root';
  const VISIBLE_RATIO = 0.35;
  const MIN_VIDEO_AREA = 160 * 90;
  const RESCAN_MS = 1200;

  /** @type {HTMLVideoElement | null} */
  let tracked = null;
  /** @type {IntersectionObserver | null} */
  let io = null;
  /** @type {MutationObserver | null} */
  let mo = null;
  /** @type {HTMLElement | null} */
  let root = null;
  /** @type {HTMLCanvasElement | null} */
  let canvas = null;
  /** @type {CanvasRenderingContext2D | null} */
  let ctx = null;
  /** @type {HTMLElement | null} */
  let fallback = null;
  /** @type {HTMLButtonElement | null} */
  let playBtn = null;
  /** @type {HTMLInputElement | null} */
  let seek = null;
  /** @type {HTMLElement | null} */
  let timeEl = null;

  let enabled = true;
  let dismissed = false;
  let miniVisible = false;
  let videoInView = true;
  let rafId = 0;
  let blankFrames = 0;
  let frameCount = 0;
  let dragState = null;

  function $(sel, el = root) {
    return el ? el.querySelector(sel) : null;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function isUsableVideo(v) {
    if (!(v instanceof HTMLVideoElement)) return false;
    if (!v.isConnected) return false;
    if (v.ended && v.currentTime <= 0) return false;
    const rect = v.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const intrinsic = (v.videoWidth || 0) * (v.videoHeight || 0);
    if (area < MIN_VIDEO_AREA && intrinsic < MIN_VIDEO_AREA) return false;
    if (v.disablePictureInPicture && area < 1) return false;
    return true;
  }

  function scoreVideo(v) {
    const rect = v.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    let score = area;
    if (!v.paused && !v.ended) score *= 4;
    if (v.readyState >= 2) score *= 1.5;
    if (document.fullscreenElement && document.fullscreenElement.contains(v)) score *= 0.1;
    // Prefer videos nearer the top of the page (main player)
    score *= 1 + Math.max(0, 1 - Math.abs(rect.top) / 2000);
    return score;
  }

  function findMainVideo() {
    const videos = Array.from(document.querySelectorAll('video')).filter(isUsableVideo);
    if (!videos.length) return null;
    videos.sort((a, b) => scoreVideo(b) - scoreVideo(a));
    return videos[0];
  }

  function ensureUI() {
    if (root && document.contains(root)) return;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="vmp-stage" title="点击回到主视频">
        <canvas width="640" height="360"></canvas>
        <div class="vmp-fallback">
          <strong>视频小窗</strong>
          <span>预览不可用（DRM/跨域），仍可控制播放</span>
        </div>
      </div>
      <div class="vmp-bar">
        <button type="button" class="vmp-play" title="播放/暂停">▶</button>
        <span class="vmp-time">0:00 / 0:00</span>
        <input class="vmp-seek" type="range" min="0" max="1000" value="0" />
        <button type="button" class="vmp-jump" title="回到主视频">↺</button>
        <button type="button" class="vmp-drag" title="拖动位置">⠿</button>
        <button type="button" class="vmp-close" title="关闭小窗">✕</button>
      </div>
    `;
    document.documentElement.appendChild(root);

    canvas = $('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    fallback = $('.vmp-fallback');
    playBtn = $('.vmp-play');
    seek = $('.vmp-seek');
    timeEl = $('.vmp-time');

    $('.vmp-stage').addEventListener('click', () => jumpToVideo());
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });
    $('.vmp-jump').addEventListener('click', (e) => {
      e.stopPropagation();
      jumpToVideo();
    });
    $('.vmp-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissed = true;
      hideMini();
    });

    seek.addEventListener('input', () => {
      if (!tracked || !Number.isFinite(tracked.duration) || tracked.duration <= 0) return;
      tracked.currentTime = (Number(seek.value) / 1000) * tracked.duration;
    });
    seek.addEventListener('click', (e) => e.stopPropagation());

    const dragHandle = $('.vmp-drag');
    dragHandle.addEventListener('pointerdown', startDrag);
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root || e.target.classList?.contains('vmp-bar')) startDrag(e);
    });
  }

  function startDrag(e) {
    if (!root || e.button !== 0) return;
    if (e.target.closest('input, .vmp-play, .vmp-jump, .vmp-close, .vmp-stage')) return;
    e.preventDefault();
    const rect = root.getBoundingClientRect();
    dragState = {
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      pointerId: e.pointerId,
    };
    root.classList.add('vmp-dragging');
    root.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  function onDragMove(e) {
    if (!dragState || !root) return;
    const x = Math.min(window.innerWidth - 40, Math.max(0, e.clientX - dragState.ox));
    const y = Math.min(window.innerHeight - 40, Math.max(0, e.clientY - dragState.oy));
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function endDrag() {
    dragState = null;
    root?.classList.remove('vmp-dragging');
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }

  function jumpToVideo() {
    if (!tracked) return;
    dismissed = false;
    tracked.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function togglePlay() {
    if (!tracked) return;
    if (tracked.paused) tracked.play().catch(() => {});
    else tracked.pause();
    syncControls();
  }

  function syncControls() {
    if (!tracked || !playBtn || !seek || !timeEl) return;
    playBtn.textContent = tracked.paused ? '▶' : '❚❚';
    const dur = tracked.duration;
    const cur = tracked.currentTime || 0;
    timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (Number.isFinite(dur) && dur > 0 && document.activeElement !== seek) {
      seek.value = String(Math.round((cur / dur) * 1000));
    }
  }

  function paintFrame() {
    if (!miniVisible || !tracked || !ctx || !canvas) return;
    const vw = tracked.videoWidth;
    const vh = tracked.videoHeight;
    if (vw > 0 && vh > 0) {
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      try {
        ctx.drawImage(tracked, 0, 0, vw, vh);
        frameCount += 1;
        // Sample occasionally — getImageData is costly and fails on tainted canvas
        if (frameCount % 30 === 0) {
          const sample = ctx.getImageData(Math.floor(vw / 2), Math.floor(vh / 2), 1, 1).data;
          const lum = sample[0] + sample[1] + sample[2];
          if (lum < 8 && !tracked.paused) blankFrames += 1;
          else blankFrames = 0;
          root.classList.toggle('vmp-blank', blankFrames > 3);
        }
      } catch {
        root.classList.add('vmp-blank');
      }
    }
    syncControls();
  }

  function loop() {
    paintFrame();
    if (miniVisible) rafId = requestAnimationFrame(loop);
  }

  function showMini() {
    if (!enabled || dismissed || !tracked) return;
    ensureUI();
    if (miniVisible) return;
    miniVisible = true;
    root.classList.add('vmp-visible');
    blankFrames = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function hideMini() {
    miniVisible = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    root?.classList.remove('vmp-visible');
  }

  function updateVisibility() {
    if (!enabled || !tracked) {
      hideMini();
      return;
    }
    if (!videoInView && !tracked.paused) showMini();
    else if (videoInView) {
      dismissed = false;
      hideMini();
    } else {
      // out of view but paused: still show if previously playing or has progress
      if (!tracked.paused || tracked.currentTime > 0.5) showMini();
      else hideMini();
    }
  }

  function bindVideo(video) {
    if (tracked === video) return;
    unbindVideo();
    tracked = video;
    dismissed = false;

    const onPlay = () => updateVisibility();
    const onPause = () => syncControls();
    const onTime = () => {
      if (!miniVisible) syncControls();
    };
    tracked.__vmpHandlers = { onPlay, onPause, onTime };
    tracked.addEventListener('play', onPlay);
    tracked.addEventListener('pause', onPause);
    tracked.addEventListener('timeupdate', onTime);
    tracked.addEventListener('ended', onPause);

    if (io) io.disconnect();
    io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        videoInView = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
        updateVisibility();
      },
      { threshold: [0, 0.15, 0.35, 0.5, 0.75, 1] }
    );
    io.observe(tracked);
    // Initial check
    const rect = tracked.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visibleH = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const ratio = rect.height > 0 ? Math.max(0, visibleH) / rect.height : 0;
    videoInView = ratio >= VISIBLE_RATIO;
    updateVisibility();
  }

  function unbindVideo() {
    if (tracked?.__vmpHandlers) {
      const { onPlay, onPause, onTime } = tracked.__vmpHandlers;
      tracked.removeEventListener('play', onPlay);
      tracked.removeEventListener('pause', onPause);
      tracked.removeEventListener('timeupdate', onTime);
      tracked.removeEventListener('ended', onPause);
      delete tracked.__vmpHandlers;
    }
    tracked = null;
    io?.disconnect();
    io = null;
    hideMini();
  }

  function rescan() {
    if (!enabled) {
      unbindVideo();
      return;
    }
    const next = findMainVideo();
    if (!next) {
      unbindVideo();
      return;
    }
    if (next !== tracked) bindVideo(next);
    else updateVisibility();
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      dismissed = false;
      hideMini();
      unbindVideo();
    } else {
      rescan();
    }
  }

  chrome.storage.sync.get({ enabled: true }, (data) => {
    setEnabled(data.enabled !== false);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.enabled) return;
    setEnabled(changes.enabled.newValue !== false);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'MINI_PLAYER_SET_ENABLED') setEnabled(msg.enabled);
  });

  mo = new MutationObserver(() => {
    // Debounced lightly via interval; here just mark need — interval handles scan
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('scroll', () => updateVisibility(), { passive: true });
  window.addEventListener('resize', () => updateVisibility(), { passive: true });

  setInterval(rescan, RESCAN_MS);
  rescan();
})();
