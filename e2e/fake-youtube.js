// Test double for the YouTube IFrame Player API, served in place of
// https://www.youtube.com/iframe_api so the player can be tested offline.
(function () {
  const players = [];
  function Player(el, opts) {
    this.opts = opts;
    this.videoId = opts.videoId;
    this.time = (opts.playerVars && opts.playerVars.start) || 0;
    this.duration = 30;
    this.state = -1;
    this.volume = 100;
    const div = document.createElement("div");
    div.setAttribute("data-testid", "fake-youtube");
    div.textContent = "YouTube player: " + this.videoId;
    el.replaceWith(div);
    this.el = div;
    players.push(this);
    window.__ytPlayers = players;
    setTimeout(() => {
      opts.events.onReady && opts.events.onReady({ target: this });
      if (opts.playerVars && opts.playerVars.autoplay) this.playVideo();
    }, 20);
  }
  Player.prototype._set = function (s) {
    this.state = s;
    this.opts.events.onStateChange && this.opts.events.onStateChange({ data: s, target: this });
  };
  Player.prototype._tick = function () {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.state !== 1) return;
      this.time += 0.25;
      if (this.time >= this.duration) {
        clearInterval(this.timer);
        this.time = this.duration;
        this._set(0);
      }
    }, 250);
  };
  Player.prototype.playVideo = function () {
    if (this.videoId === "unplayable0") {
      this.opts.events.onError && this.opts.events.onError({ data: 150 });
      return;
    }
    this._set(3);
    setTimeout(() => {
      this._set(1);
      this._tick();
    }, 30);
  };
  Player.prototype.pauseVideo = function () { this._set(2); };
  Player.prototype.stopVideo = function () { this._set(5); };
  Player.prototype.loadVideoById = function (o) { this.videoId = o.videoId; this.time = o.startSeconds || 0; this.el.textContent = "YouTube player: " + this.videoId; this.playVideo(); };
  Player.prototype.cueVideoById = function (o) { this.videoId = o.videoId; this.time = o.startSeconds || 0; this.el.textContent = "YouTube player: " + this.videoId; this._set(5); };
  Player.prototype.seekTo = function (s) { this.time = s; };
  Player.prototype.setVolume = function (v) { this.volume = v; };
  Player.prototype.unMute = function () {};
  Player.prototype.getCurrentTime = function () { return this.time; };
  Player.prototype.getDuration = function () { return this.duration; };
  Player.prototype.getPlayerState = function () { return this.state; };
  Player.prototype.destroy = function () { clearInterval(this.timer); };
  window.YT = { Player: Player };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
})();
