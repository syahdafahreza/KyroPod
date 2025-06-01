const { useState, useRef, useEffect, useCallback } = React;

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// --- CUSTOM HOOK: useMarquee ---
const useMarquee = (text, targetRef, gapPixels = 30, speed = 30) => {
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflowAndSetMarquee = () => {
      if (targetRef.current) {
        const tempSpan = document.createElement("span");
        tempSpan.style.visibility = "hidden";
        tempSpan.style.position = "absolute";
        tempSpan.style.whiteSpace = "nowrap";

        const computedStyle = getComputedStyle(targetRef.current);
        tempSpan.style.fontSize = computedStyle.fontSize;
        tempSpan.style.fontFamily = computedStyle.fontFamily;
        tempSpan.style.fontWeight = computedStyle.fontWeight;
        tempSpan.style.letterSpacing = computedStyle.letterSpacing;
        tempSpan.textContent = text;

        document.body.appendChild(tempSpan);
        const singleTextWidth = tempSpan.scrollWidth;
        document.body.removeChild(tempSpan);

        const containerWidth = targetRef.current.clientWidth;
        const overflows = singleTextWidth > containerWidth;

        setIsOverflowing(overflows);

        if (overflows) {
          const distanceToScroll = singleTextWidth + gapPixels;
          const duration = distanceToScroll / speed;
          targetRef.current.style.setProperty(
            "--marquee-duration",
            `${duration}s`
          );
          targetRef.current.style.setProperty(
            "--marquee-distance",
            `-${distanceToScroll}px`
          );
        } else {
          targetRef.current.style.setProperty("--marquee-duration", "0s");
          targetRef.current.style.setProperty("--marquee-distance", "0px");
        }
      }
    };
    const timeoutId = setTimeout(checkOverflowAndSetMarquee, 100);
    window.addEventListener("resize", checkOverflowAndSetMarquee);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", checkOverflowAndSetMarquee);
    };
  }, [text, targetRef, gapPixels, speed]);
  return { isOverflowing };
};

const useAudioStateSync = (audioRef, setIsPlaying) => {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [audioRef, setIsPlaying]);
};
// --- END CUSTOM HOOK ---

function App() {
  // Core Audio & File Handling
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentObjectUrl = useRef(null);

  // Audio Processing (Web Audio API)
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const lowShelfFilterRef = useRef(null);
  const peakingFilterRef = useRef(null);
  const highShelfFilterRef = useRef(null);

  // UI Elements & Interaction
  const playlistListRef = useRef(null); // Ref for the playlist UL element
  const titleRef = useRef(null);
  const artistRef = useRef(null);
  const sliderBoxRef = useRef(null);
  const sortButtonRef = useRef(null);
  const dropupMenuRef = useRef(null);
  const volumeFlyoutTimerRef = useRef(null);
  const lrcFileInputRef = useRef(null);
  const lyricsNotificationTimerRef = useRef(null);

  // State-like Refs (for values that don't trigger re-renders but need to be persisted)
  const isPlayingRef = useRef(isPlaying);

  // --- State ---

  // Playlist & Core Playback Control
  const [playlist, setPlaylist] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Song Information & Lyrics
  const [songTitle, setSongTitle] = useState(
    "Tidak ada lagu yang sedang diputar"
  );
  const [songArtist, setSongArtist] = useState("");
  const [albumArtUrl, setAlbumArtUrl] = useState(
    "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
  );
  const [lrcData, setLrcData] = useState({ fileName: null, lyrics: [] });
  const [currentLyric, setCurrentLyric] = useState({ text: "", key: 0 }); // 'key' untuk memicu animasi ulang

  // Playback Progress & Volume
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [flyoutDisplayVolume, setFlyoutDisplayVolume] = useState(0); // Terkait UI volume

  // UI Visibility & Toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEQSidebarOpen, setIsEQSidebarOpen] = useState(false);
  const [isSortDropupOpen, setIsSortDropupOpen] = useState(false);
  const [isLyricFlyoutVisible, setIsLyricFlyoutVisible] = useState(false);
  const [isVolumeFlyoutVisible, setIsVolumeFlyoutVisible] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [lyricsNotification, setLyricsNotification] = useState({
    visible: false,
    message: "",
  });

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState("");

  // Equalizer Settings
  const [eqSettings, setEqSettings] = useState({ low: 0, mid: 0, high: 0 });

  // Animation & Effects Control
  const [initialAnimationsApplied, setInitialAnimationsApplied] =
    useState(false);

  // Feature-Specific State (Contoh: Auto-scroll)
  const [hasScrolledThisSession, setHasScrolledThisSession] = useState(false);

  // --- Custom Hooks & Effects Init ---
  useAudioStateSync(audioRef, setIsPlaying);

  const showLyricsNotification = (message) => {
    setLyricsNotification({ visible: true, message });
    if (lyricsNotificationTimerRef.current) {
      clearTimeout(lyricsNotificationTimerRef.current);
    }
    lyricsNotificationTimerRef.current = setTimeout(() => {
      setLyricsNotification({ visible: false, message: "" });
    }, 3500); // Tampilkan notifikasi selama 3.5 detik
  };

  // Sinkronisasi state play/pause audio element dengan state React
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // --- Constants & Derived State ---
  const gapPixels = 30;
  const SIDEBAR_ANIMATION_DURATION = 300; // ms, match this with your CSS transition for .playlist-card
  const SCROLL_SETTLE_DELAY = 50; // ms, for scrollTop=0 to paint before smooth scroll

  const { isOverflowing: isTitleOverflowing } = useMarquee(
    songTitle,
    titleRef,
    gapPixels
  );
  const { isOverflowing: isArtistOverflowing } = useMarquee(
    songArtist,
    artistRef,
    gapPixels
  );
  const filteredPlaylist = playlist.filter(
    (song) =>
      (song.displayName || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (song.metadata?.title || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (song.metadata?.artist || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  // Effect to reset scroll flag when sidebar closes
  useEffect(() => {
    if (!isSidebarOpen) {
      setHasScrolledThisSession(false);
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    const splashScreen = document.getElementById("splash-screen");

    if (splashScreen) {
      const displayDuration = 2500; // Show splash fully opaque for 2 seconds
      // This allows the 1.5s loading bar to complete with some margin.
      const fadeDuration = 500; // This MUST match your CSS transition-duration for opacity on #splash-screen.hidden

      // Timer to initiate the fade-out after the displayDuration
      const fadeTimer = setTimeout(() => {
        if (splashScreen.parentNode) {
          // Check if splashScreen still exists
          splashScreen.classList.add("hidden");

          // Timer to remove the element from DOM after fade-out animation completes
          const removeTimer = setTimeout(() => {
            if (splashScreen.parentNode) {
              splashScreen.parentNode.removeChild(splashScreen);
            }
          }, fadeDuration);

          // Store removeTimer ID on the element for potential cleanup during unmount
          splashScreen.dataset.removeTimerId = removeTimer.toString();
        }
      }, displayDuration);

      // Cleanup function for when the App component unmounts
      return () => {
        clearTimeout(fadeTimer);

        const removeTimerId = splashScreen.dataset.removeTimerId;
        if (removeTimerId) {
          clearTimeout(parseInt(removeTimerId));
        }

        // Fallback: If the component unmounts unexpectedly while splash is still there,
        // and it hasn't been removed by the timers, ensure it's removed.
        // This is a safeguard, primarily for rapid development HMR or edge cases.
        if (splashScreen.parentNode) {
          // splashScreen.parentNode.removeChild(splashScreen); // Consider if truly needed, might conflict if already mid-removal
        }
      };
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialAnimationsApplied(true);
    }, 4600); // Adjust if animation timings change

    return () => clearTimeout(timer); // Cleanup timer on component unmount
  }, []);

  // Effect for playlist auto-scroll (one-time per open session)
  useEffect(() => {
    const listElement = playlistListRef.current;

    // Conditions to perform scroll:
    // 1. Sidebar must be open.
    // 2. List element must exist.
    // 3. There must be a current song.
    // 4. The one-time scroll for this session must not have happened yet.
    if (
      !isSidebarOpen ||
      !listElement ||
      currentSongIndex === null ||
      !playlist[currentSongIndex] ||
      hasScrolledThisSession
    ) {
      return;
    }

    const activeItem = listElement.querySelector(".playlist-item.active");

    if (activeItem) {
      const offsetTopInList = activeItem.offsetTop;
      // Calculate scroll position to bring the item towards the center of the visible list
      const targetScrollTop =
        offsetTopInList -
        listElement.clientHeight / 2 +
        activeItem.clientHeight / 2;
      // Clamp the scroll top to be within valid bounds of the scrollable area
      const clampedTargetScrollTop = Math.max(
        0,
        Math.min(
          targetScrollTop,
          listElement.scrollHeight - listElement.clientHeight
        )
      );

      // Wait for sidebar opening animation to complete
      setTimeout(() => {
        if (playlistListRef.current) {
          // Check ref again as component might unmount
          playlistListRef.current.scrollTop = 0; // Scroll to top first

          // Short delay to allow the scrollTop=0 to paint before smooth scrolling
          setTimeout(() => {
            if (playlistListRef.current) {
              // Check ref again
              playlistListRef.current.scrollTo({
                top: clampedTargetScrollTop,
                behavior: "smooth",
              });
              setHasScrolledThisSession(true); // Mark as scrolled for this session
            }
          }, SCROLL_SETTLE_DELAY);
        }
      }, SIDEBAR_ANIMATION_DURATION);
    } else {
      // If active item not found (e.g., list is still rendering),
      // don't set hasScrolledThisSession to true, so it can try again on next render if dependencies change.
    }
  }, [
    isSidebarOpen,
    currentSongIndex,
    playlist,
    filteredPlaylist,
    hasScrolledThisSession,
  ]); // filteredPlaylist is a dependency because the .active item is rendered based on it.
  // --- END: Auto-scroll feature additions ---

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    return () => {
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
    };
  }, []);

  const toggleEQSidebar = () => {
    setIsEQSidebarOpen((prevState) => !prevState);
    setIsSidebarOpen(false);
    if (
      !isEQSidebarOpen &&
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      audioContextRef.current
        .resume()
        .catch((e) => console.error("Error resuming AudioContext:", e));
    }
  };

  const handleEQChange = useCallback((band, value) => {
    setEqSettings((prevSettings) => ({
      ...prevSettings,
      [band]: parseFloat(value),
    }));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    const audioContext = audioContextRef.current;
    if (
      !sourceNodeRef.current ||
      sourceNodeRef.current.mediaElement !== audio
    ) {
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      try {
        sourceNodeRef.current = audioContext.createMediaElementSource(audio);
      } catch (e) {
        console.error("Error creating MediaElementSource:", e);
        return;
      }
    }
    if (!gainNodeRef.current) {
      gainNodeRef.current = audioContext.createGain();
      gainNodeRef.current.gain.value = volume;
    }
    if (!lowShelfFilterRef.current) {
      lowShelfFilterRef.current = audioContext.createBiquadFilter();
      lowShelfFilterRef.current.type = "lowshelf";
      lowShelfFilterRef.current.frequency.value = 250;
    }
    if (!peakingFilterRef.current) {
      peakingFilterRef.current = audioContext.createBiquadFilter();
      peakingFilterRef.current.type = "peaking";
      peakingFilterRef.current.frequency.value = 1500;
      peakingFilterRef.current.Q.value = 1;
    }
    if (!highShelfFilterRef.current) {
      highShelfFilterRef.current = audioContext.createBiquadFilter();
      highShelfFilterRef.current.type = "highshelf";
      highShelfFilterRef.current.frequency.value = 4000;
    }
    sourceNodeRef.current.disconnect();
    gainNodeRef.current.disconnect();
    lowShelfFilterRef.current.disconnect();
    peakingFilterRef.current.disconnect();
    try {
      sourceNodeRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(lowShelfFilterRef.current);
      lowShelfFilterRef.current.connect(peakingFilterRef.current);
      peakingFilterRef.current.connect(highShelfFilterRef.current);
      highShelfFilterRef.current.connect(audioContext.destination);
    } catch (e) {
      console.error("Error connecting audio nodes:", e);
    }
  }, []);

  useEffect(() => {
    if (
      !lowShelfFilterRef.current ||
      !peakingFilterRef.current ||
      !highShelfFilterRef.current
    )
      return;
    lowShelfFilterRef.current.gain.value = eqSettings.low;
    peakingFilterRef.current.gain.value = eqSettings.mid;
    highShelfFilterRef.current.gain.value = eqSettings.high;
  }, [eqSettings]);

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
  }, [volume]);

  const handleSearchClick = () => {
    setIsSearchActive((prev) => !prev);
    if (isSearchActive) setSearchQuery("");
  };
  const toggleSortDropup = () => setIsSortDropupOpen((prev) => !prev);

  const sortPlayListBy = (criteria) => {
    setPlaylist((prevPlaylist) => {
      const currentSongFile =
        currentSongIndex !== null ? prevPlaylist[currentSongIndex] : null;
      const newPlaylist = [...prevPlaylist];
      newPlaylist.sort((a, b) => {
        let valA, valB;
        if (criteria === "title") {
          valA = (a.metadata?.title || a.displayName || "").toLowerCase();
          valB = (b.metadata?.title || b.displayName || "").toLowerCase();
        } else if (criteria === "artist") {
          valA = (a.metadata?.artist || "").toLowerCase();
          valB = (b.metadata?.artist || "").toLowerCase();
        } else if (criteria === "dateAdded") {
          valA = a.lastModified;
          valB = b.lastModified;
        }
        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
      });
      if (currentSongFile) {
        // Re-find the current song's index after sorting
        const newIdx = newPlaylist.findIndex(
          (song) => song === currentSongFile
        );
        if (newIdx !== -1) setCurrentSongIndex(newIdx);
        else setCurrentSongIndex(null); // Should not happen if song objects are stable
      }
      return newPlaylist;
    });
    setIsSortDropupOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isSortDropupOpen &&
        dropupMenuRef.current &&
        !dropupMenuRef.current.contains(event.target) &&
        sortButtonRef.current &&
        !sortButtonRef.current.contains(event.target)
      ) {
        setIsSortDropupOpen(false);
      }
    };
    const positionDropupMenu = () => {
      if (isSortDropupOpen && sortButtonRef.current && dropupMenuRef.current) {
        const buttonRect = sortButtonRef.current.getBoundingClientRect();
        const menuElement = dropupMenuRef.current;
        menuElement.style.top = `${
          buttonRect.top - menuElement.offsetHeight - 10
        }px`;
        menuElement.style.left = `${buttonRect.left}px`;
        menuElement.style.minWidth = `${buttonRect.width}px`;
      }
    };
    if (isSortDropupOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", positionDropupMenu);
      window.addEventListener("scroll", positionDropupMenu, true); // Listen on all scroll events
      setTimeout(positionDropupMenu, 0);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", positionDropupMenu);
      window.removeEventListener("scroll", positionDropupMenu, true);
    };
  }, [isSortDropupOpen]);

  const calculateSliderPositions = useCallback(() => {
    if (!sliderBoxRef.current || duration === 0) {
      return { thumbLeft: 0, colorWidth: 0 };
    }
    const htmlFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const thumbWidthPx = 2 * htmlFontSize;
    const halfThumbWidthPx = thumbWidthPx / 2;
    const trackWidthPx = sliderBoxRef.current.clientWidth;
    let rawProgressRatio = currentTime / duration;
    rawProgressRatio = Math.max(0, Math.min(1, rawProgressRatio));
    const effectiveTrackWidthForThumbCenter = trackWidthPx - thumbWidthPx;
    let thumbCenterPx = rawProgressRatio * effectiveTrackWidthForThumbCenter;
    thumbCenterPx += halfThumbWidthPx;
    const colorFillPx = thumbCenterPx;
    const thumbLeftPercentage = (thumbCenterPx / trackWidthPx) * 100;
    const colorWidthPercentage = (colorFillPx / trackWidthPx) * 100;
    return {
      thumbLeft: Math.max(0, Math.min(100, thumbLeftPercentage)),
      colorWidth: Math.max(0, Math.min(100, colorWidthPercentage)),
    };
  }, [currentTime, duration]);

  const { thumbLeft, colorWidth } = calculateSliderPositions();
  const handleSearchChange = (e) => setSearchQuery(e.target.value);

  const shuffleArray = (array) => {
    let currentIndex = array.length,
      randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
    return array;
  };

  const toggleRepeat = () => {
    setIsRepeating((prevRepeating) => {
      const newRepeatingState = !prevRepeating;
      if (newRepeatingState) setIsShuffling(false);
      if (audioRef.current) audioRef.current.loop = newRepeatingState;
      return newRepeatingState;
    });
  };

  const toggleShuffle = () => {
    setIsShuffling((prevShuffling) => {
      const newShufflingState = !prevShuffling;
      if (newShufflingState) {
        setIsRepeating(false);
        if (audioRef.current) audioRef.current.loop = false;
        setPlaylist((oldPlaylist) => {
          const currentSong =
            currentSongIndex !== null ? oldPlaylist[currentSongIndex] : null;
          const shuffled = shuffleArray([
            ...oldPlaylist.filter((song) => song !== currentSong),
          ]);
          const newPlaylist = currentSong
            ? [currentSong, ...shuffled]
            : shuffled;
          if (currentSong) {
            const newIdx = newPlaylist.findIndex((s) => s === currentSong);
            if (newIdx !== -1) setCurrentSongIndex(newIdx);
            else setCurrentSongIndex(0); // Fallback
          } else if (newPlaylist.length > 0) {
            setCurrentSongIndex(0);
          }
          return newPlaylist;
        });
      }
      return newShufflingState;
    });
  };

  const playNextSong = useCallback(async () => {
    if (playlist.length === 0) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      try {
        await audioContextRef.current.resume();
      } catch (e) {
        console.error("Error resuming AudioContext in playNextSong:", e);
      }
    }

    let nextIndex;
    if (isShuffling) {
      if (playlist.length <= 1) {
        nextIndex = 0; // Loop the single song if shuffling and only one song
        if (playlist.length === 0) nextIndex = null;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * playlist.length);
        } while (playlist.length > 1 && nextIndex === currentSongIndex);
      }
    } else {
      if (
        currentSongIndex === null ||
        currentSongIndex === playlist.length - 1
      ) {
        nextIndex = 0;
        if (!isRepeating && currentSongIndex === playlist.length - 1) {
          setIsPlaying(false);
          // Optionally reset to first song paused: setCurrentSongIndex(0);
          return;
        }
      } else {
        nextIndex = currentSongIndex + 1;
      }
    }

    if (nextIndex !== null && playlist[nextIndex]) {
      setCurrentSongIndex(nextIndex);
      setIsPlaying(true);
    } else if (playlist.length > 0) {
      // Fallback for safety
      setCurrentSongIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [
    playlist,
    currentSongIndex,
    isShuffling,
    isRepeating,
    audioRef,
    audioContextRef,
  ]);

  const handleError = useCallback(
    (event) => {
      const audioElement = event.target;
      console.error("Audio playback error event object:", event);
      if (audioElement.error) {
        console.error(
          "MediaError code:",
          audioElement.error.code,
          "Message:",
          audioElement.error.message
        );
      } else {
        console.error("No MediaError object available on the audio element.");
      }
      setIsPlaying(false);
      // Optionally, try to play next song after a delay
      // setTimeout(() => playNextSong(), 1000);
    },
    [setIsPlaying]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);

    const handleAudioEnded = async () => {
      if (!isRepeating) {
        await playNextSong();
      } else {
        // If repeating, audio.loop=true should handle it.
        // Ensure UI state is consistent if browser doesn't fire 'play' event on loop.
        if (audio.loop) {
          audio.currentTime = 0; // Reset time
          try {
            await audio.play(); // Ensure it plays
            setIsPlaying(true); // Sync state
          } catch (e) {
            console.error("Error re-playing looped audio:", e);
            setIsPlaying(false);
          }
        } else {
          // Fallback if loop attribute was somehow lost
          await playNextSong();
        }
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleAudioEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleAudioEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [playNextSong, isRepeating, handleError]);

  // useEffect untuk Memuat Data Lagu
  // Hook useEffect yang menangani pembaruan audioRef.src dan metadata lagu perlu disesuaikan karena playlist[currentSongIndex] sekarang adalah objek, bukan File secara langsung.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentObjectUrl.current) {
      URL.revokeObjectURL(currentObjectUrl.current);
      currentObjectUrl.current = null;
    }

    if (currentSongIndex !== null && playlist[currentSongIndex]) {
      const songObject = playlist[currentSongIndex]; // song adalah objek sekarang

      // Pastikan songObject dan songObject.file ada
      if (!songObject || !songObject.file) {
        if (audio.src) audio.src = "";
        setSongTitle("Tidak ada lagu yang sedang diputar");
        setSongArtist("");
        setAlbumArtUrl(
          "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
        );
        setCurrentTime(0);
        setDuration(0);
        setCurrentLyric({ text: "", key: 0 });
        setIsLyricFlyoutVisible(false);
        // setIsPlaying(false); // Biarkan useAudioStateSync yang menangani ini
        return; // Keluar dari effect jika tidak ada file yang valid
      }
      const audioFile = songObject.file; // Ambil file dari objek lagu

      const newObjectUrl = URL.createObjectURL(audioFile);
      currentObjectUrl.current = newObjectUrl;

      audio.src = newObjectUrl;
      audio.loop = isRepeating;

      // Gunakan displayName untuk judul awal jika tag tidak ada, atau metadata.title jika sudah ada
      const initialTitle =
        songObject.metadata?.title ||
        songObject.displayName ||
        audioFile.name.split(".").slice(0, -1).join(".") ||
        audioFile.name;
      const initialArtist = songObject.metadata?.artist || "";

      setSongTitle(initialTitle); // Set judul awal dengan cepat
      setSongArtist(initialArtist); // Set artis awal dengan cepat
      // Reset lirik saat lagu berubah, sebelum jsmediatags selesai atau lirik dari songObject dimuat
      setCurrentLyric({ text: "", key: Date.now() });
      setIsLyricFlyoutVisible(false);

      jsmediatags.read(audioFile, {
        // Gunakan audioFile
        onSuccess: function (tag) {
          const newTitle = tag.tags.title || initialTitle;
          const newArtist = tag.tags.artist || initialArtist;

          // Hanya update state jika ada perubahan
          if (newTitle !== songTitle) {
            setSongTitle(newTitle);
          }
          if (newArtist !== songArtist) {
            setSongArtist(newArtist);
          }

          // Dapatkan objek lagu saat ini dari state playlist TERBARU untuk perbandingan
          const currentSongFromPlaylist = playlist[currentSongIndex];

          // Hanya panggil setPlaylist jika metadata di playlist benar-benar perlu diupdate
          // dan currentSongFromPlaylist ada (untuk menghindari error jika playlist kosong atau indeks tidak valid)
          if (
            currentSongFromPlaylist &&
            (currentSongFromPlaylist.metadata?.title !== newTitle ||
              currentSongFromPlaylist.metadata?.artist !== newArtist)
          ) {
            setPlaylist((prevPlaylist) => {
              // Pastikan prevPlaylist[currentSongIndex] masih valid
              if (prevPlaylist && prevPlaylist[currentSongIndex]) {
                return prevPlaylist.map((song, index) => {
                  if (index === currentSongIndex) {
                    // Hanya update jika metadata berbeda dari yang sudah ada di playlist
                    if (
                      song.metadata?.title !== newTitle ||
                      song.metadata?.artist !== newArtist
                    ) {
                      return {
                        ...song,
                        metadata: { title: newTitle, artist: newArtist },
                      };
                    }
                  }
                  return song;
                });
              }
              return prevPlaylist; // Kembalikan state sebelumnya jika tidak valid
            });
          }

          if (tag.tags.picture) {
            const base64String = arrayBufferToBase64(tag.tags.picture.data);
            // Hanya update jika URL album art berbeda untuk menghindari re-render yang tidak perlu
            if (
              albumArtUrl !==
              `data:${tag.tags.picture.format};base64,${base64String}`
            ) {
              setAlbumArtUrl(
                `data:${tag.tags.picture.format};base64,${base64String}`
              );
            }
          } else {
            if (
              albumArtUrl !==
              "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
            ) {
              setAlbumArtUrl(
                "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
              );
            }
          }
        },
        onError: function (error) {
          console.error("Error reading media tags:", error);
          // songTitle dan songArtist sudah di set ke initialTitle/Artist di atas
          setAlbumArtUrl(
            "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
          );
        },
      });

      const attemptPlayOnLoad = async () => {
        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          try {
            await audioContextRef.current.resume();
          } catch (e) {
            console.error("attemptPlayOnLoad: Error resuming AudioContext:", e);
          }
        }
        // Use isPlayingRef.current to check the *intent* to play
        if (
          isPlayingRef.current &&
          audio.src &&
          audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA
        ) {
          try {
            await audio.play();
          } catch (error) {
            console.error(
              "attemptPlayOnLoad: Error during audio.play():",
              error.name,
              error.message
            );
            if (error.name === "NotAllowedError") {
              setIsPlaying(false);
            }
          }
        }
      };

      const handleCanPlayThrough = () => {
        setDuration(audio.duration); // Also set duration here
        if (isPlayingRef.current) {
          // Check intent to play
          attemptPlayOnLoad();
        }
      };

      audio.load(); // Important to load the new source
      audio.addEventListener("canplaythrough", handleCanPlayThrough, {
        once: true,
      });

      return () => {
        audio.removeEventListener("canplaythrough", handleCanPlayThrough);
      };
    } else {
      if (audio.src) audio.src = "";
      setSongTitle("Tidak ada lagu yang sedang diputar");
      setSongArtist("");
      setAlbumArtUrl("https://placehold.co/200x200/bec8e4/9baacf?text=No+Art");
      setCurrentTime(0);
      setDuration(0);
      setCurrentLyric({ text: "", key: 0 }); // Tambahkan ini
      setIsLyricFlyoutVisible(false); // Tambahkan ini
      // setIsPlaying(false); // Biarkan useAudioStateSync yang menangani ini
    }
  }, [currentSongIndex, playlist, isRepeating, audioRef, audioContextRef]);

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const audioFilesMap = new Map();
    const lrcFilesMap = new Map();

    // Pisahkan file audio dan LRC, simpan berdasarkan nama dasar (tanpa ekstensi)
    files.forEach((file) => {
      const fileName = file.name;
      const baseName =
        fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
      if (
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|flac|m4a)$/i.test(fileName)
      ) {
        audioFilesMap.set(baseName, file);
      } else if (/\.lrc$/i.test(fileName)) {
        lrcFilesMap.set(baseName, file);
      }
    });

    const newPlaylistSongs = [];
    for (const [baseName, audioFile] of audioFilesMap) {
      let lyricsData = null;
      if (lrcFilesMap.has(baseName)) {
        const lrcFile = lrcFilesMap.get(baseName);
        try {
          const lrcContent = await lrcFile.text();
          lyricsData = parseLRC(lrcContent); // parseLRC Anda sudah ada
          if (lyricsData && lyricsData.length > 0) {
            console.log(`Lyrics found and parsed for: ${baseName}`);
          } else {
            console.log(`LRC file for ${baseName} was empty or unparsable.`);
            lyricsData = null; // Pastikan null jika tidak valid
          }
        } catch (e) {
          console.error("Error reading or parsing LRC file:", lrcFile.name, e);
          lyricsData = null; // Pastikan null jika ada error
        }
      }

      newPlaylistSongs.push({
        file: audioFile,
        name: audioFile.name, // Nama file asli lengkap
        displayName: baseName, // Nama dasar untuk pencocokan & tampilan awal
        lyrics: lyricsData, // lyricsData akan null jika tidak ada LRC atau ada error
        lastModified: audioFile.lastModified,
        metadata: { title: baseName, artist: "" }, // Metadata awal, akan diupdate oleh jsmediatags
      });
    }

    if (newPlaylistSongs.length > 0) {
      let processedPlaylist = [...newPlaylistSongs]; // Menggantikan playlist lama

      if (isShuffling) {
        processedPlaylist = shuffleArray(processedPlaylist);
        if (processedPlaylist.length > 0) {
          setCurrentSongIndex(0);
        } else {
          setCurrentSongIndex(null);
        }
      } else {
        if (processedPlaylist.length > 0) {
          setCurrentSongIndex(0);
        } else {
          setCurrentSongIndex(null);
        }
      }
      setPlaylist(processedPlaylist);
      setIsPlaying(false); // Jangan autoplay saat folder baru dimuat
      // Kosongkan lrcData global karena lirik kini per lagu
      setLrcData({ fileName: null, lyrics: [] });
      setCurrentLyric({ text: "", key: 0 });
      setIsLyricFlyoutVisible(false);
    } else if (files.length > 0 && audioFilesMap.size === 0) {
      showLyricsNotification(
        "Tidak ada file audio yang ditemukan di folder yang dipilih."
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openFolder = () => fileInputRef.current.click();

  // Fungsi openSingleFile
  // Saat menambahkan satu file audio melalui tombol "Tambahkan File", kita juga perlu membuat objek lagu dengan struktur baru, dengan lyrics: null pada awalnya.
  const openSingleFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    // Izinkan pemilihan multiple file dan tambahkan .lrc ke tipe file yang diterima
    input.multiple = true;
    input.accept = "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.lrc";

    input.onchange = async (event) => {
      // Jadikan fungsi ini async untuk await lrcFile.text()
      const files = Array.from(event.target.files);
      if (files.length === 0) {
        return; // Tidak ada file yang dipilih
      }

      let audioFile = null;
      const lrcFilesMap = new Map();

      // Iterasi untuk menemukan file audio pertama dan memetakan semua file LRC
      for (const selectedFile of files) {
        const fileName = selectedFile.name;
        const baseName =
          fileName.substring(0, fileName.lastIndexOf(".")) || fileName;

        // Ambil file audio pertama yang valid
        if (
          !audioFile &&
          (selectedFile.type.startsWith("audio/") ||
            /\.(mp3|wav|ogg|flac|m4a)$/i.test(fileName))
        ) {
          audioFile = selectedFile;
        } else if (/\.lrc$/i.test(fileName)) {
          lrcFilesMap.set(baseName, selectedFile);
        }
      }

      if (!audioFile) {
        showLyricsNotification(
          "File audio tidak ditemukan dalam pilihan Anda."
        );
        // Reset input file jika perlu
        if (event.target) event.target.value = "";
        return;
      }

      // File audio sudah ditemukan, sekarang cari liriknya
      const audioBaseName =
        audioFile.name.substring(0, audioFile.name.lastIndexOf(".")) ||
        audioFile.name;
      let lyricsData = null;

      if (lrcFilesMap.has(audioBaseName)) {
        const lrcFile = lrcFilesMap.get(audioBaseName);
        try {
          const lrcContent = await lrcFile.text(); // Membaca konten file LRC
          lyricsData = parseLRC(lrcContent); // Fungsi parseLRC yang sudah ada
          if (lyricsData && lyricsData.length > 0) {
            console.log(
              `Lyrics found and parsed for (single add): ${audioBaseName}`
            );
          } else {
            console.log(
              `LRC file for ${audioBaseName} (single add) was empty or unparsable.`
            );
            lyricsData = null; // Pastikan null jika tidak valid
          }
        } catch (e) {
          console.error(
            "Error reading or parsing LRC file (single add):",
            lrcFile.name,
            e
          );
          lyricsData = null; // Pastikan null jika ada error
        }
      }

      const newSongObject = {
        file: audioFile,
        name: audioFile.name,
        displayName: audioBaseName,
        lyrics: lyricsData, // lyricsData akan null jika tidak ada LRC yang cocok atau ada error
        lastModified: audioFile.lastModified,
        metadata: { title: audioBaseName, artist: "" }, // Metadata awal
      };

      setPlaylist((prevPlaylist) => {
        const existingSongIndex = prevPlaylist.findIndex(
          (song) =>
            song.name === newSongObject.name &&
            song.lastModified === newSongObject.lastModified
        );

        if (existingSongIndex !== -1) {
          showLyricsNotification(
            `Lagu "${newSongObject.displayName}" sudah ada di playlist.`
          );
          return prevPlaylist;
        }

        let updatedPlaylist = [...prevPlaylist, newSongObject];
        let newCurrentSongIndex = currentSongIndex;

        if (isShuffling) {
          const currentPlayingSong =
            currentSongIndex !== null ? prevPlaylist[currentSongIndex] : null;
          let songsToShuffle = [...prevPlaylist, newSongObject];

          if (currentPlayingSong) {
            songsToShuffle = songsToShuffle.filter(
              (s) =>
                !(
                  s.name === currentPlayingSong.name &&
                  s.lastModified === currentPlayingSong.lastModified
                )
            );
            const shuffledPart = shuffleArray(songsToShuffle);
            updatedPlaylist = [currentPlayingSong, ...shuffledPart];
            newCurrentSongIndex = 0;
          } else {
            updatedPlaylist = shuffleArray(songsToShuffle);
            newCurrentSongIndex = updatedPlaylist.length > 0 ? 0 : null;
            if (newCurrentSongIndex !== null) setIsPlaying(false);
          }
        } else {
          if (currentSongIndex === null && updatedPlaylist.length === 1) {
            newCurrentSongIndex = 0;
            setIsPlaying(false);
          }
        }

        setCurrentSongIndex(newCurrentSongIndex);
        // Jika lagu baru ditambahkan dan menjadi lagu saat ini, reset lirik global lama (jika masih ada)
        // dan pastikan lirik flyout tidak menampilkan lirik dari lagu sebelumnya.
        if (
          newCurrentSongIndex === updatedPlaylist.length - 1 ||
          (newCurrentSongIndex === 0 && updatedPlaylist.length === 1)
        ) {
          setLrcData({ fileName: null, lyrics: [] });
          setCurrentLyric({ text: "", key: Date.now() });
          setIsLyricFlyoutVisible(false);
        }
        return updatedPlaylist;
      });

      // Reset input file setelah diproses
      if (event.target) event.target.value = "";
    };
    input.click();
  };

  const togglePlayPause = useCallback(async () => {
    if (playlist.length === 0 || currentSongIndex === null) {
      // If no song is selected but playlist has items, perhaps select the first one?
      // For now, if currentSongIndex is null, and play is pressed, it does nothing.
      // User should click a song in the playlist first if currentSongIndex is null.
      setIsPlaying(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      setIsPlaying(false);
      return;
    }

    try {
      if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        await audioContextRef.current.resume();
      }

      if (!isPlayingRef.current) {
        // If intent is to PLAY (currently paused/stopped)
        if (audio.src && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
          // Song is loaded (or at least metadata is available), just paused.
          // Force a re-trigger of the song loading effect to refresh metadata,
          // especially if replaying the same song that just ended.
          setCurrentSongIndex((idx) => idx); // <--- KEY CHANGE FOR REPLAY METADATA
          await audio.play();
          // setIsPlaying(true) will be handled by useAudioStateSync via 'play' event
        } else if (playlist[currentSongIndex]) {
          // No src, or src but not ready. Song needs full load/reload.
          // This also covers the case where src might have been cleared.
          setIsPlaying(true); // Set intent to play *before* triggering effect.
          // So isPlayingRef.current will be true when the song loading effect runs.
          setCurrentSongIndex((idx) => idx); // Trigger song loading effect (which sets src and plays)
        } else {
          // Should not happen if currentSongIndex is valid and playlist has items.
          setIsPlaying(false);
        }
      } else {
        // If intent is to PAUSE
        if (!audio.paused) {
          audio.pause();
          // setIsPlaying(false) will be handled by useAudioStateSync via 'pause' event
        }
      }
    } catch (error) {
      console.error("Error in togglePlayPause (play/pause attempt):", error);
      setIsPlaying(false); // Ensure UI reflects paused state on error
    }
  }, [
    playlist,
    currentSongIndex,
    audioRef,
    audioContextRef /* setIsPlaying not needed as dep here */,
  ]);

  const playSong = useCallback(
    async (indexInFiltered) => {
      const actualIndex = playlist.indexOf(filteredPlaylist[indexInFiltered]);
      if (actualIndex === -1) return;
      const audio = audioRef.current;
      if (!audio) return;

      try {
        if (
          audioContextRef.current &&
          audioContextRef.current.state === "suspended"
        ) {
          await audioContextRef.current.resume();
        }
        if (actualIndex !== currentSongIndex) {
          setCurrentSongIndex(actualIndex);
          setIsPlaying(true);
        } else {
          await togglePlayPause();
        }
      } catch (error) {
        setIsPlaying(false);
      }
    },
    [playlist, filteredPlaylist, currentSongIndex, togglePlayPause]
  );

  const playPreviousSong = async () => {
    if (playlist.length === 0) return;
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      try {
        await audioContextRef.current.resume();
      } catch (e) {
        console.error("Error resuming context in playPreviousSong", e);
      }
    }
    let prevIndex;
    if (isShuffling) {
      if (playlist.length <= 1) prevIndex = 0;
      else {
        do {
          prevIndex = Math.floor(Math.random() * playlist.length);
        } while (playlist.length > 1 && prevIndex === currentSongIndex);
      }
    } else {
      prevIndex =
        (currentSongIndex !== null
          ? currentSongIndex - 1 + playlist.length
          : playlist.length - 1) % playlist.length;
    }
    setCurrentSongIndex(prevIndex);
    setIsPlaying(true);
  };

  const handleProgressBarChange = (e) => {
    const audio = audioRef.current;
    if (!audio || isNaN(audio.duration) || audio.duration === 0) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    // setCurrentTime(newTime); // Updated by 'timeupdate' event
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value); // Volume is 0.0 to 1.0
    setVolume(newVolume); // This updates the actual audio volume and will trigger the useEffect for gainNodeRef

    // --- Flyout Logic START ---
    setFlyoutDisplayVolume(Math.round(newVolume * 100)); // Set volume for display (0-100)
    setIsVolumeFlyoutVisible(true); // Show the flyout

    // Clear any existing timer for the flyout
    if (volumeFlyoutTimerRef.current) {
      clearTimeout(volumeFlyoutTimerRef.current);
    }

    // Set a new timer to hide the flyout after a delay (e.g., 2 seconds)
    volumeFlyoutTimerRef.current = setTimeout(() => {
      setIsVolumeFlyoutVisible(false);
    }, 2000); // Adjust timeout (in milliseconds) as needed
    // --- Flyout Logic END ---
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prevState) => !prevState);
    setIsEQSidebarOpen(false);
  };
  const handleCloseBothSidebars = () => {
    setIsSidebarOpen(false);
    setIsEQSidebarOpen(false);
  };

  const handleDeleteSong = (indexToDeleteInOriginal, event) => {
    event.stopPropagation();
    setPlaylist((prevPlaylist) => {
      const songToDelete = prevPlaylist[indexToDeleteInOriginal];
      const newPlaylist = prevPlaylist.filter(
        (_, idx) => idx !== indexToDeleteInOriginal
      );

      if (newPlaylist.length === 0) {
        setCurrentSongIndex(null);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        // Reset info lagu karena playlist kosong
        setSongTitle("Tidak ada lagu yang sedang diputar");
        setSongArtist("");
        setAlbumArtUrl(
          "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art"
        );
        setCurrentTime(0);
        setDuration(0);
        setCurrentLyric({ text: "", key: 0 }); // Tambahkan/Pastikan ini ada
        setIsLyricFlyoutVisible(false); // Tambahkan/Pastikan ini ada
        setLrcData({ fileName: null, lyrics: [] }); // Tambahkan/Pastikan ini ada
      } else if (currentSongIndex === indexToDeleteInOriginal) {
        // If the deleted song was playing or selected
        // Play the next available song (or first if deleted was last)
        // The isPlaying state will be handled by the song loading effect
        const newIndexToPlay = indexToDeleteInOriginal % newPlaylist.length;
        setCurrentSongIndex(newIndexToPlay);
        // If it was playing, the new song should start playing due to isPlayingRef.current
      } else if (
        currentSongIndex !== null &&
        currentSongIndex > indexToDeleteInOriginal
      ) {
        setCurrentSongIndex(currentSongIndex - 1);
      }
      return newPlaylist;
    });
  };

  const clearPlayList = () => {
    setPlaylist([]);
    setCurrentSongIndex(null);
    setIsPlaying(false);
    setSearchQuery("");
    setIsRepeating(false);
    setIsShuffling(false);
    setLrcData({ fileName: null, lyrics: [] }); // Reset lrcData
    setCurrentLyric({ text: "", key: 0 });
    setIsLyricFlyoutVisible(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.loop = false;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (lrcFileInputRef.current) lrcFileInputRef.current.value = "";
    setEqSettings({ low: 0, mid: 0, high: 0 });
    // Reset song info display
    setSongTitle("Tidak ada lagu yang sedang diputar");
    setSongArtist("");
    setAlbumArtUrl("https://placehold.co/200x200/bec8e4/9baacf?text=No+Art");
    setCurrentTime(0);
    setDuration(0);
  };

  // Fungsi untuk Parsing File .lrc
  const parseLRC = (lrcContent) => {
    const lines = lrcContent.split("\n");
    const lyrics = [];
    // Regex untuk [mm:ss.xx]text atau [mm:ss.xxx]text
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    lines.forEach((line) => {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        // Pastikan milidetik selalu 3 digit (misal .5 jadi .500, .56 jadi .560)
        const millisecondsStr = match[3].padEnd(3, "0");
        const milliseconds = parseInt(millisecondsStr, 10);
        const time = minutes * 60 + seconds + milliseconds / 1000;
        const text = match[4].trim();

        // Hanya tambahkan jika ada teks liriknya
        if (text) {
          lyrics.push({ time, text });
        }
      }
    });
    return lyrics.sort((a, b) => a.time - b.time); // Urutkan berdasarkan waktu
  };

  // Fungsi Handler untuk Input File LRC
  const handleLrcFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      if (lrcFileInputRef.current) lrcFileInputRef.current.value = "";
      return;
    }

    const lrcBaseName =
      file.name.substring(0, file.name.lastIndexOf(".")) || file.name;

    if (currentSongIndex === null || !playlist[currentSongIndex]) {
      showLyricsNotification(
        "Pilih atau putar lagu terlebih dahulu untuk memuat lirik."
      );
      if (lrcFileInputRef.current) lrcFileInputRef.current.value = "";
      return;
    }

    const currentSongObject = playlist[currentSongIndex];
    // Gunakan displayName dari objek lagu saat ini untuk pencocokan
    const audioBaseName = currentSongObject.displayName;

    if (lrcBaseName.toLowerCase() === audioBaseName.toLowerCase()) {
      if (currentSongObject.lyrics && currentSongObject.lyrics.length > 0) {
        showLyricsNotification(
          `Lirik untuk "${audioBaseName}" sudah ada/dimuat sebelumnya.`
        );
      } else {
        try {
          const content = await file.text();
          const parsedLyrics = parseLRC(content); // parseLRC Anda sudah ada
          if (parsedLyrics && parsedLyrics.length > 0) {
            setPlaylist((prevPlaylist) =>
              prevPlaylist.map((song, index) =>
                index === currentSongIndex
                  ? { ...song, lyrics: parsedLyrics } // Tambahkan lirik ke objek lagu
                  : song
              )
            );
            showLyricsNotification(
              `Lirik untuk "${audioBaseName}" berhasil dimuat.`
            );
            // Reset lirik yang sedang ditampilkan karena lirik baru telah dimuat untuk lagu saat ini
            setCurrentLyric({ text: "", key: Date.now() });
            setIsLyricFlyoutVisible(false);
          } else {
            showLyricsNotification(
              `File lirik "${lrcBaseName}" kosong atau formatnya tidak valid.`
            );
          }
        } catch (e) {
          console.error("Error reading or parsing LRC file:", file.name, e);
          showLyricsNotification(
            `Gagal memuat lirik "${lrcBaseName}": ${e.message}`
          );
        }
      }
    } else {
      showLyricsNotification(
        `Lirik "${lrcBaseName}" tidak cocok dengan lagu saat ini ("${audioBaseName}").`
      );
    }

    // Selalu reset input file LRC
    if (lrcFileInputRef.current) {
      lrcFileInputRef.current.value = "";
    }
    // Kosongkan lrcData global karena lirik kini per lagu dan sudah ditangani
    setLrcData({ fileName: null, lyrics: [] });
  };

  const openLrcFile = () => {
    if (lrcFileInputRef.current) {
      lrcFileInputRef.current.click();
    }
  };

  // useEffect untuk Sinkronisasi Lirik dengan Audio
  useEffect(() => {
    const currentSongObject = playlist[currentSongIndex];
    let activeLyrics = null;

    // Cek apakah lagu saat ini ada, punya lirik, dan sedang diputar
    if (
      currentSongObject &&
      currentSongObject.lyrics &&
      currentSongObject.lyrics.length > 0 &&
      isPlaying
    ) {
      activeLyrics = currentSongObject.lyrics;
    }

    if (!activeLyrics) {
      // Jika tidak ada lirik aktif (atau kondisi tidak terpenuhi)
      if (isLyricFlyoutVisible) {
        setIsLyricFlyoutVisible(false);
      }
      if (currentLyric.text !== "") {
        setCurrentLyric({ text: "", key: Date.now() });
      }
      return; // Keluar lebih awal
    }

    // Logika pencarian lirik berdasarkan currentTime
    let newLyricToShow = null;
    for (let i = 0; i < activeLyrics.length; i++) {
      const lyricLine = activeLyrics[i];
      const nextLyricLine =
        i + 1 < activeLyrics.length ? activeLyrics[i + 1] : null;

      if (currentTime >= lyricLine.time) {
        if (nextLyricLine) {
          if (currentTime < nextLyricLine.time) {
            newLyricToShow = lyricLine;
            break;
          }
        } else {
          // Ini adalah baris lirik terakhir
          newLyricToShow = lyricLine;
          break;
        }
      }
    }

    if (newLyricToShow) {
      // Hanya update jika teks lirik berubah atau flyout tidak visible (untuk memicu animasi masuk)
      if (newLyricToShow.text !== currentLyric.text || !isLyricFlyoutVisible) {
        setCurrentLyric({ text: newLyricToShow.text, key: Date.now() });
        if (!isLyricFlyoutVisible && newLyricToShow.text.trim() !== "") {
          // Hanya tampilkan jika ada teks
          setIsLyricFlyoutVisible(true);
        } else if (newLyricToShow.text.trim() === "" && isLyricFlyoutVisible) {
          // Sembunyikan jika teks kosong
          setIsLyricFlyoutVisible(false);
        }
      }
    } else {
      // Tidak ada lirik yang cocok untuk currentTime (misalnya, sebelum lirik pertama atau setelah terakhir)
      if (isLyricFlyoutVisible) {
        setIsLyricFlyoutVisible(false);
      }
      if (currentLyric.text !== "") {
        setCurrentLyric({ text: "", key: Date.now() });
      }
    }
    // Hapus lrcData dari dependencies. playlist dan currentSongIndex sudah ada.
    // currentLyric.text ditambahkan agar effect dievaluasi ulang jika text berubah dari luar (jarang, tapi aman)
  }, [
    currentTime,
    playlist,
    currentSongIndex,
    isPlaying,
    isLyricFlyoutVisible,
    currentLyric.text,
  ]);

  return (
    <div className="container">
      <div
        className={`playlist-card ${
          isSidebarOpen || isEQSidebarOpen ? "open" : "collapsed"
        }`}
      >
        <div className="playlist-header">
          {isSidebarOpen && <h3>Playlist</h3>}
          {isEQSidebarOpen && <h3>Equalizer</h3>}
          <div className="header-buttons-group">
            {isSidebarOpen && (
              <button
                className="search-toggle-btn"
                onClick={handleSearchClick}
                aria-label="Search Playlist"
              >
                <i className="fas fa-search"></i>
              </button>
            )}
            <button
              className="sidebar-toggle-btn"
              onClick={
                isSidebarOpen || isEQSidebarOpen
                  ? handleCloseBothSidebars
                  : toggleSidebar
              }
              aria-label={
                isSidebarOpen || isEQSidebarOpen
                  ? "Close Sidebars"
                  : "Open Playlist"
              }
            >
              <i
                className={`fas ${
                  isSidebarOpen || isEQSidebarOpen ? "fa-times" : "fa-bars"
                }`}
              ></i>
            </button>
          </div>
        </div>

        {/* Wrapper for playlist content to manage flex layout and height */}
        {isSidebarOpen && !isEQSidebarOpen && (
          <div
            className="playlist-content-wrapper"
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              overflow: "hidden",
              height:
                "calc(100% - 3.5rem)" /* Adjust if header height changes */,
            }}
          >
            {isSearchActive && (
              <div
                className="search-input-container"
                style={{ flexShrink: 0, padding: "0.5rem" }}
              >
                <input
                  type="text"
                  placeholder="Cari lagu..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
            )}
            <ul
              className="playlist-list"
              ref={playlistListRef}
              style={{ flexGrow: 1, overflowY: "auto", padding: "0 0.5rem" }}
            >
              {filteredPlaylist.length === 0 && searchQuery !== "" ? (
                <li className="playlist-empty">No matching songs found.</li>
              ) : playlist.length === 0 ? (
                <li className="playlist-empty">
                  Belum ada lagu yang ditambahkan.
                </li>
              ) : (
                filteredPlaylist.map((song, indexInFiltered) => {
                  const displayTitle =
                    song.metadata?.title && song.metadata.title.trim() !== ""
                      ? song.metadata.title
                      : song.displayName;
                  const displayArtist = song.metadata?.artist;
                  const originalIndex = playlist.indexOf(song);
                  return (
                    <li
                      key={
                        song.file.name +
                        originalIndex +
                        (song.lastModified || indexInFiltered)
                      } // Gunakan song.file.name untuk key yang lebih stabil
                      className={`playlist-item ${
                        currentSongIndex === originalIndex ? "active" : ""
                      }`}
                    >
                      <div
                        className="playlist-item-inner"
                        onClick={() => playSong(indexInFiltered)} // Pass index from filtered list
                      >
                        <span className="playlist-song-name">
                          {displayArtist
                            ? `${displayArtist} - ${displayTitle}`
                            : displayTitle}
                        </span>
                        <button
                          className="btn btn__delete"
                          onClick={(e) => handleDeleteSong(originalIndex, e)}
                          aria-label={`Delete ${displayTitle}`}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            <div
              className="button-container-flex"
              style={{
                marginTop: "auto",
                paddingTop: "1rem",
                paddingBottom: "0.5rem",
                flexShrink: 0,
                paddingLeft: "0.5rem",
                paddingRight: "0.5rem",
              }}
            >
              <button
                className="btn btn-pl btn__secondary"
                onClick={openFolder}
                title="Buka Folder"
              >
                <i className="fas fa-folder"></i>
              </button>
              <button
                className="btn btn-pl btn__secondary"
                onClick={openSingleFile}
                title="Tambahkan File ke Playlist"
              >
                <i className="fas fa-file-audio"></i>
              </button>
              <button
                className="btn btn-pl btn__secondary"
                onClick={clearPlayList}
                title="Bersihkan Playlist"
              >
                <i className="fas fa-trash"></i>
              </button>
              <div className="dropup-container-absolute">
                <div className="dropup">
                  <button
                    className="btn btn-pl btn__secondary dropup-toggle"
                    onClick={toggleSortDropup}
                    title="Urutkan Playlist berdasarkan..."
                    ref={sortButtonRef}
                  >
                    <i className="fa-solid fa-sort"></i>
                  </button>
                  {isSortDropupOpen && (
                    <div
                      className="dropup-menu"
                      ref={dropupMenuRef}
                      style={{ position: "fixed", zIndex: 1000 }}
                    >
                      <button
                        className="dropup-item"
                        onClick={() => sortPlayListBy("title")}
                      >
                        Judul
                      </button>
                      <button
                        className="dropup-item"
                        onClick={() => sortPlayListBy("artist")}
                      >
                        Artist
                      </button>
                      <button
                        className="dropup-item"
                        onClick={() => sortPlayListBy("dateAdded")}
                      >
                        Tanggal
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                className="btn btn-pl btn__secondary"
                title="Muat Lirik (LRC)"
                onClick={openLrcFile}
              >
                <i className="fas fa-closed-captioning"></i>{" "}
                {/* Contoh icon untuk file/lirik, sesuaikan jika perlu */}
              </button>
            </div>
          </div>
        )}

        {!isSidebarOpen && !isEQSidebarOpen && (
          <>
            <button
              className={`sidebar-toggle-btn mt-3 ${
                isEQSidebarOpen ? "eq-button-hidden" : ""
              } ${!initialAnimationsApplied ? "apply-initial-fade" : ""}`}
              aria-label="Open Equalizer"
              onClick={toggleEQSidebar}
              style={{ alignSelf: "center" }}
            >
              <i className="fas fa-sliders" aria-hidden="true"></i>
            </button>
            <button
              className={`sidebar-toggle-btn mt-3 ${
                !initialAnimationsApplied ? "apply-initial-fade" : ""
              }`} // Perhatikan class, tidak perlu eq-button-hidden
              aria-label="Open Settings"
              onClick={() => console.log("Tombol Pengaturan Eksternal Diklik!")} // Ganti dengan fungsi untuk membuka sidebar pengaturan nanti
              style={{ alignSelf: "center" }} // Gaya yang sama agar sejajar
            >
              <i className="fas fa-gear"></i> {/* Icon Gear untuk Pengaturan */}
            </button>
            <div
              className={`playlist-card-logo mb-3 font-weight-bold ${
                !initialAnimationsApplied ? "apply-initial-fade" : ""
              }`}
              style={{ textAlign: "center", marginTop: "auto" }}
            >
              Kyrop<i className="fas fa-compact-disc"></i>d
            </div>
          </>
        )}

        {isEQSidebarOpen && !isSidebarOpen && (
          <div className="eq-controls">
            <div className="eq-band">
              <label>Bass</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqSettings.low}
                onChange={(e) => handleEQChange("low", e.target.value)}
                className="eq-slider"
              />
              <span>{eqSettings.low}dB</span>
            </div>
            <div className="eq-band">
              <label>Mid</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqSettings.mid}
                onChange={(e) => handleEQChange("mid", e.target.value)}
                className="eq-slider"
              />
              <span>{eqSettings.mid}dB</span>
            </div>
            <div className="eq-band">
              <label>Treble</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={eqSettings.high}
                onChange={(e) => handleEQChange("high", e.target.value)}
                className="eq-slider"
              />
              <span>{eqSettings.high}dB</span>
            </div>
            <button
              className="btn btn-pl btn__secondary"
              onClick={() => setEqSettings({ low: 0, mid: 0, high: 0 })}
              style={{ marginTop: "1rem" }}
            >
              Reset EQ
            </button>
          </div>
        )}
        <input
          type="file"
          webkitdirectory=""
          directory=""
          multiple=""
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        />
      </div>

      {/* Main Player Card */}
      <div className="player-card">
        {isLyricFlyoutVisible && currentLyric.text && (
          <div key={currentLyric.key} className="lyric-flyout-container">
            <div className="lyric-flyout-content">{currentLyric.text}</div>
          </div>
        )}
        <div className="album-art-wrapper">
          <img
            src={albumArtUrl}
            alt="Album Art"
            className="album-art"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src =
                "https://placehold.co/200x200/bec8e4/9baacf?text=No+Art";
            }}
          />
        </div>
        <div className="song-info mt-2">
          <h2
            className={`song-title ${isTitleOverflowing ? "is-scrolling" : ""}`}
            ref={titleRef}
            title={songTitle}
          >
            <span>
              {songTitle}
              {isTitleOverflowing && (
                <>
                  <span
                    style={{ width: `${gapPixels}px`, display: "inline-block" }}
                  ></span>
                  {songTitle}
                </>
              )}
            </span>
          </h2>
          <p
            className={`song-artist ${
              isArtistOverflowing ? "is-scrolling-artist" : ""
            }`}
            ref={artistRef}
            title={songArtist}
          >
            <span>
              {songArtist}
              {isArtistOverflowing && (
                <>
                  <span
                    style={{ width: `${gapPixels}px`, display: "inline-block" }}
                  ></span>
                  {songArtist}
                </>
              )}
            </span>
          </p>
        </div>

        <div className="controls-wrapper">
          <div className="slider">
            <div className="slider__box" ref={sliderBoxRef}>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleProgressBarChange}
                className="progress-slider"
                disabled={playlist.length === 0 || duration === 0}
              />
              <span
                className="slider__btn"
                style={{ left: `calc(${thumbLeft}% - 1rem)` }}
              ></span>{" "}
              {/* Adjusted for 2rem thumb */}
              <span
                className="slider__color"
                style={{ width: `${colorWidth}%` }}
              ></span>{" "}
              {/* Color width matches thumb center */}
            </div>
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-buttons">
            <button
              className={`icon__repeat ${isRepeating ? "active" : ""}`}
              onClick={toggleRepeat}
              aria-label="Repeat Song"
              disabled={playlist.length === 0}
            >
              <i className="fas fa-redo"></i>
            </button>
            <button
              className="icon__prev"
              onClick={playPreviousSong}
              aria-label="Previous Song"
              disabled={playlist.length === 0}
            >
              <i className="fas fa-step-backward"></i>
            </button>
            <div className="circle">
              <button
                className={`circle__btn ${isPlaying ? "shadow" : ""}`}
                onClick={togglePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
                disabled={playlist.length === 0}
              >
                <i className="fas fa-play"></i>
                <i className="fas fa-pause"></i>
              </button>
              <div
                className={`circle__back-1 ${
                  isPlaying && playlist.length > 0 && !isBuffering
                    ? ""
                    : "paused"
                }`}
              ></div>
              <div
                className={`circle__back-2 ${
                  isPlaying && playlist.length > 0 && !isBuffering
                    ? ""
                    : "paused"
                }`}
              ></div>
            </div>
            <button
              className="icon__next"
              onClick={playNextSong}
              aria-label="Next Song"
              disabled={playlist.length === 0}
            >
              <i className="fas fa-step-forward"></i>
            </button>
            <button
              className={`icon__shuffle ${isShuffling ? "active" : ""}`}
              onClick={toggleShuffle}
              aria-label="Shuffle Playlist"
              disabled={playlist.length === 0}
            >
              <i className="fas fa-random"></i>
            </button>
          </div>

          <div className="volume-control">
            <i className="fas fa-volume-down"></i>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              aria-label="Volume Slider"
              disabled={playlist.length === 0}
            />
            <i className="fas fa-volume-up"></i>
          </div>
        </div>
      </div>
      <audio ref={audioRef} preload="metadata"></audio>
      <input
        type="file"
        ref={lrcFileInputRef}
        onChange={handleLrcFileChange}
        style={{ display: "none" }}
        accept=".lrc"
      />
      {isBuffering && (
        <div
          className="buffering-indicator"
          style={{
            position: "fixed",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "5px 10px",
            borderRadius: "5px",
            zIndex: 2000,
          }}
        >
          Buffering...
        </div>
      )}
      {/* Volume Flyout Element - Add this inside your App component's return statement */}
      <div
        className={`volume-flyout-container ${
          isVolumeFlyoutVisible ? "visible" : ""
        }`}
      >
        <div className="volume-flyout-content">
          <i
            className={
              // Determine icon based on volume level
              flyoutDisplayVolume === 0
                ? "fas fa-volume-mute"
                : flyoutDisplayVolume <= 33
                ? "fas fa-volume-off" // Icon for low volume
                : flyoutDisplayVolume <= 66
                ? "fas fa-volume-down" // Icon for medium volume
                : "fas fa-volume-up" // Icon for high volume
            }
          ></i>
          <div className="volume-flyout-bar-wrapper">
            <div
              className="volume-flyout-bar-fill"
              style={{ width: `${flyoutDisplayVolume}%` }}
            ></div>
          </div>
          <span className="volume-flyout-value">{flyoutDisplayVolume}</span>
        </div>
      </div>
      {/* Lyric Notification Flyout */}
      {lyricsNotification.visible && (
        <div
          className="lyric-notification-flyout"
          style={{
            position: "fixed",
            bottom: "70px", // Sesuaikan posisi agar tidak tertumpuk buffering indicator
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.75)",
            color: "white",
            padding: "10px 20px",
            borderRadius: "8px",
            zIndex: 2001, // Pastikan di atas elemen lain
            fontSize: "0.9rem",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          }}
        >
          {lyricsNotification.message}
        </div>
      )}
    </div>
  );
}
ReactDOM.render(<App />, document.getElementById("root"));