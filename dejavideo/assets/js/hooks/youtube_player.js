// assets/js/hooks/youtube_player.js
const YouTubePlayer = {
  mounted() {
    this.player = null;
    this.loadYouTubeAPI();
  },

  destroyed() {
    if (this.player) {
      this.player.destroy();
    }
  },

  loadYouTubeAPI() {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => this.initPlayer();
    } else {
      this.initPlayer();
    }
  },

  initPlayer() {
    const youtubeId = this.el.dataset.youtubeId;
    
    this.player = new window.YT.Player(this.el, {
      height: '100%',
      width: '100%',
      videoId: youtubeId,
      playerVars: {
        autoplay: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            this.pushEvent("video-ended");
          }
        }
      }
    });
    
    this.handleEvent("load-video", ({ youtube_id }) => {
      if (this.player) {
        this.player.loadVideoById(youtube_id);
      }
    });
  }
};

export default YouTubePlayer;