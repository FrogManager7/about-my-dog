// ── HTMLの要素 ──
const startScreen = document.querySelector(".start-screen");
const startSoundButton = document.querySelector(".start-sound-button");
const startSilentButton = document.querySelector(".start-silent-button");
const quiz = document.querySelector(".quiz");

const choiceButtons = document.querySelectorAll(".choice-button");
const result = document.querySelector(".result");
const nextButton = document.querySelector(".next-button");
const restartButton = document.querySelector(".restart-button");
const questionNumber = document.querySelector(".question-number");
const questionText = document.querySelector(".question");
const bgmButton = document.querySelector(".bgm-button");
const clearMessage = document.querySelector(".clear-message");


// ── 音とクイズの状態 ──
let isSoundEnabled = false;
let isQuizFinished = false;
let isFinishing = false;

let audioContext;
let soundGain;
let audioReadyPromise;

let bgmBuffer;
let clearBuffer;

let musicSource = null;
let musicKind = null;
let musicStartedAt = 0;

let bgmPausedAt = 0;
let clearPausedAt = 0;
let clearHasEnded = false;


// ── 音声の準備 ──
function createAudioSystem() {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();

  // すべての音を、この音量調整につなぐ
  soundGain = audioContext.createGain();
  soundGain.gain.value = 0;
  soundGain.connect(audioContext.destination);
}

async function readAudio(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`音源の読み込みに失敗: ${response.status}`);
  }

  const data = await response.arrayBuffer();
  return audioContext.decodeAudioData(data);
}

function loadAudio() {
  if (!audioReadyPromise) {
    audioReadyPromise = Promise.all([
      readAudio("audio/chaco-theme.wav"),
      readAudio("audio/chaco-clear-theme.wav")
    ]).then(([normal, clear]) => {
      bgmBuffer = normal;
      clearBuffer = clear;
    }).catch((error) => {
      // 失敗した場合は、次に再試行できるようにする
      audioReadyPromise = null;
      throw error;
    });
  }

  return audioReadyPromise;
}

function updateSoundButton() {
  bgmButton.textContent = isSoundEnabled
    ? "🔊 音オン"
    : "🔇 音オフ";

  bgmButton.setAttribute(
    "aria-pressed",
    String(isSoundEnabled)
  );
}


// ── BGM・締めの曲の再生と停止 ──
function playMusic(kind) {
  if (!isSoundEnabled || musicSource) {
    return;
  }

  if (kind === "clear" && clearHasEnded) {
    return;
  }

  const buffer = kind === "normal" ? bgmBuffer : clearBuffer;

  if (!buffer) {
    return;
  }

  const offset = kind === "normal"
    ? bgmPausedAt
    : clearPausedAt;

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();

  source.buffer = buffer;
  source.loop = kind === "normal";

  gain.gain.value = kind === "normal" ? 0.3 : 0.5;

  source.connect(gain);
  gain.connect(soundGain);

  musicSource = source;
  musicKind = kind;
  musicStartedAt = audioContext.currentTime - offset;

  source.addEventListener("ended", () => {
    source.disconnect();
    gain.disconnect();

    // 一時停止した古い再生部品なら、状態を変更しない
    if (musicSource !== source) {
      return;
    }

    musicSource = null;
    musicKind = null;

    if (kind === "clear") {
      clearHasEnded = true;
      clearPausedAt = 0;
    }
  }, { once: true });

  source.start(0, offset);
}

function pauseMusic() {
  if (!musicSource) {
    return;
  }

  const elapsed = audioContext.currentTime - musicStartedAt;

  if (musicKind === "normal") {
    bgmPausedAt = elapsed % bgmBuffer.duration;
  } else {
    clearPausedAt = Math.min(elapsed, clearBuffer.duration);

    if (clearPausedAt >= clearBuffer.duration) {
      clearHasEnded = true;
      clearPausedAt = 0;
    }
  }

  const source = musicSource;

  // stopによるendedと、自然な曲の終了を区別する
  musicSource = null;
  musicKind = null;
  source.stop();
}


// ── 音あり・音なしの設定 ──
async function setSoundEnabled(enabled) {
  if (!enabled) {
    isSoundEnabled = false;

    if (soundGain) {
      soundGain.gain.value = 0;
    }

    pauseMusic();
    updateSoundButton();
    return;
  }

  bgmButton.disabled = true;

  try {
    createAudioSystem();

    // ボタンを押した直後に音声を有効にする
    const resumePromise = audioContext.resume();

    bgmButton.textContent = "音を準備中…";

    await Promise.all([resumePromise, loadAudio()]);

    isSoundEnabled = true;
    soundGain.gain.value = 1;

    if (!isFinishing) {
      playMusic(isQuizFinished ? "clear" : "normal");
    }
  } catch (error) {
    isSoundEnabled = false;

    if (soundGain) {
      soundGain.gain.value = 0;
    }

    console.error("音声の準備に失敗しました:", error);
    result.textContent =
      "音声を読み込めませんでした。音なしでも遊べます。";
  } finally {
    updateSoundButton();
    bgmButton.disabled = false;
  }
}


// ── 最初の案内画面 ──
async function startQuiz(withSound) {
  startSoundButton.disabled = true;
  startSilentButton.disabled = true;

  showQuestion();

  // 音ありの場合は、このクリックで音声を準備する
  const soundReady = setSoundEnabled(withSound);

  startScreen.hidden = true;
  quiz.hidden = false;

  // 案内画面からクイズへ、キーボードのフォーカスも移す
  questionText.tabIndex = -1;
  questionText.focus();

  await soundReady;
}

startSoundButton.addEventListener("click", () => {
  startQuiz(true);
});

startSilentButton.addEventListener("click", () => {
  startQuiz(false);
});

// 途中でも、すべての音を切り替えられる
bgmButton.addEventListener("click", () => {
  setSoundEnabled(!isSoundEnabled);
});


// ── 問題のデータ ──
const questions = [
  {
    text: "この子の名前は？",
    choices: ["チョコ", "チャコ", "チコ"],
    answer: "チャコ",
    message: "正解！ 名前はチャコです。"
  },
  {
    text: "チャコの犬種は？",
    choices: [
      "トイプードル",
      "ミニチュア\nダックスフンド",
      "ビーグル"
    ],
    answer: "トイプードル",
    message: "正解！ チャコはトイプードルです。"
  },
  {
    text: "チャコの体重は約何キロ？",
    choices: ["3キロ", "5キロ", "7キロ"],
    answer: "7キロ",
    message: "正解！ チャコの体重は約7キロです。"
  },
  {
    text: "チャコの誕生日は何月？",
    choices: ["4月", "7月", "10月"],
    answer: "4月",
    message: "正解！ チャコの誕生日は4月です。"
  },
  {
    text: "サイトで紹介しているチャコの特徴で、\n一番高いのは？",
    choices: ["社交性", "自立性", "共感・察知力"],
    answer: "共感・察知力",
    message: "正解！ 一番高いのは共感・察知力です。"
  },
  {
    text: "チャコが家族になったのはいつ？",
    choices: ["私の誕生日", "母の誕生日", "クリスマス"],
    answer: "私の誕生日",
    message: "正解！ チャコが家族になったのは私の誕生日です。"
  },
  {
    text: "チャコのチャームポイントは？",
    choices: ["小さな手", "短い足", "短いしっぽ"],
    answer: "短い足",
    message: "正解！ チャコのチャームポイントは短い足です。"
  },
  {
    text: "チャコが散歩で一番反応するのは？",
    choices: ["虫", "鳥", "木の実"],
    answer: "鳥",
    message: "正解！ チャコは散歩中、鳥に一番よく反応します。"
  },
  {
    text: "チャコのしつけで、\nいちばん難しかったのは？",
    choices: ["トイレ", "ハウス", "吠え癖"],
    answer: "トイレ",
    message: "正解！ いちばん難しかったしつけはトイレトレーニングです。"
  },
  {
    text: "チャコはいつ吠える？",
    choices: ["留守番の前", "食事の前", "寝る前"],
    answer: "寝る前",
    message: "正解！ チャコは寝る前に吠えることがあります。"
  }
];

let currentQuestionIndex = 0;

function showQuestion() {
  const question = questions[currentQuestionIndex];

  questionText.textContent = question.text;

  questionNumber.textContent =
    `第${currentQuestionIndex + 1}問 / 全${questions.length}問`;

  choiceButtons.forEach((button, index) => {
    const boxIcon = button.querySelector(".box-icon");

    button.querySelector(".choice-text").textContent =
      question.choices[index];

    button.dataset.answer = question.choices[index];

    boxIcon.textContent = "📦";
    boxIcon.classList.remove("treat-pop");
    button.classList.remove("correct");
    button.disabled = false;
  });

  result.textContent = "";
  nextButton.hidden = true;
  restartButton.hidden = true;
  clearMessage.hidden = true;

  clearMessage.querySelector(".clear-title").textContent =
    `🎉 全${questions.length}問クリア！ 🎉`;

  clearMessage.querySelector(".clear-description").textContent =
    `チャコにおやつを${questions.length}個あげられたよ！`;
}


// ── 答えの判定 ──
choiceButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const question = questions[currentQuestionIndex];

    if (button.dataset.answer !== question.answer) {
      result.textContent = "おしい！ 別の箱を選んでみてね。";
      playWrongSound();
      return;
    }

    result.textContent = question.message;

    const boxIcon = button.querySelector(".box-icon");
    boxIcon.textContent = "🦴";
    boxIcon.classList.add("treat-pop");
    button.classList.add("correct");

    choiceButtons.forEach((choiceButton) => {
      choiceButton.disabled = true;
    });

    if (currentQuestionIndex < questions.length - 1) {
      playCorrectSound();
      nextButton.hidden = false;
      return;
    }

    // 最後の問題
    isQuizFinished = true;
    isFinishing = true;

    pauseMusic();
    bgmPausedAt = 0;

    clearMessage.hidden = false;
    restartButton.hidden = false;
    restartButton.disabled = true;

    celebrate();

    try {
      // 正解音が終わってから、締めの曲を流す
      await playCorrectSound();
    } finally {
      isFinishing = false;
      playMusic("clear");
      restartButton.disabled = false;
    }
  });
});

nextButton.addEventListener("click", () => {
  if (currentQuestionIndex < questions.length - 1) {
    currentQuestionIndex += 1;
    showQuestion();
  }
});


// ── もう一度遊ぶ ──
restartButton.addEventListener("click", () => {
  pauseMusic();

  bgmPausedAt = 0;
  clearPausedAt = 0;
  clearHasEnded = false;

  currentQuestionIndex = 0;
  isQuizFinished = false;
  isFinishing = false;

  document.querySelectorAll(".confetti").forEach((confetti) => {
    confetti.remove();
  });

  quiz.classList.remove("celebrating");

  showQuestion();

  // 音の設定を引き継ぐ
  playMusic("normal");
});


// ── 紙吹雪 ──
function celebrate() {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const colors = [
    "#f6c945",
    "#7fc8a9",
    "#ee8f9b",
    "#8da7e8",
    "#c89bea"
  ];

  for (let i = 0; i < 80; i++) {
    const confetti = document.createElement("span");
    confetti.classList.add("confetti");

    confetti.style.setProperty("--left", `${Math.random() * 100}vw`);
    confetti.style.setProperty(
      "--color",
      colors[Math.floor(Math.random() * colors.length)]
    );
    confetti.style.setProperty("--duration", `${3 + Math.random()}s`);
    confetti.style.setProperty("--delay", `${Math.random() * 6}s`);
    confetti.style.setProperty(
      "--rotation",
      `${360 + Math.random() * 720}deg`
    );

    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 11000);
  }

  quiz.classList.add("celebrating");
  setTimeout(() => quiz.classList.remove("celebrating"), 600);
}


// ── 正解音 ──
async function playCorrectSound() {
  // 音オフなら、音を作らず終了する
  if (!isSoundEnabled || !audioContext) {
    return;
  }

  try {
    await audioContext.resume();

    if (!isSoundEnabled) {
      return;
    }

    const startTime = audioContext.currentTime + 0.02;

    function playNote(frequency, delay, duration) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startTime + delay;

      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        noteStart + duration
      );

      oscillator.connect(gain);
      gain.connect(soundGain);

      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration + 0.02);

      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });

      return oscillator;
    }

    playNote(1318.51, 0, 0.14);
    playNote(1046.50, 0.14, 0.19);
    playNote(1318.51, 0.34, 0.14);

    const lastNote = playNote(1046.50, 0.48, 0.30);

    await new Promise((resolve) => {
      lastNote.addEventListener("ended", resolve, { once: true });
    });
  } catch (error) {
    console.error("正解音を再生できませんでした:", error);
  }
}

// ── 不正解音：短くやさしい「ポッ」 ──
async function playWrongSound() {
  //音オフなら鳴らさない
  if (!isSoundEnabled || !audioContext) {
    return;
  }

  try {
    await audioContext.resume();

    if (!isSoundEnabled) {
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startTime = audioContext.currentTime;

    //丸く、やわらかい音色
    oscillator.type = "sine";

    //少し高い音から低い音へ下げる
    oscillator.frequency.setValueAtTime(440, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(280, startTime + 0.12);

    //短い立ち上がりと、消えていく余韻
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

    oscillator.connect(gain);
    gain.connect(soundGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);

    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, {once: true});
  } catch (error) {
    console.error("不正解音を再生できませんでした:", error);
  }
}

// ── 最初の表示 ──
showQuestion();
updateSoundButton();