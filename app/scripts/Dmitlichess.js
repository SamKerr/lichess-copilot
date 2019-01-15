'use strict';

class Dmitlichess {
  constructor(movesElement) {
    this.options = {};
    this.audioQueue = {};
    this.intervals = {
      misc: undefined,
      fill: undefined,
      long: undefined
    };

    this.movesElement = movesElement;

    this.emitters = {
      moves: undefined,
      gameStates: undefined
    };

    if (!sounds) { throw new Error('No sound files'); }
    if (!this.movesElement) { throw new Error('Lichess moves notation not found'); }
  }

  addListeners(el) {
    el.addEventListener('queueCleared', ()=> this.resetMiscInterval());

    el.addEventListener('move',    (e)=> this.audioQueue.push(e.detail.notation));
    el.addEventListener('capture', (e)=> this.audioQueue.push(e.detail.notation));
    el.addEventListener('check',   ()=> this.audioQueue.push('check'));
    el.addEventListener('start',   ()=> this.audioQueue.push('start'));
    el.addEventListener('state',   (e)=> {
      if (e.detail.isOver) { this.gameOver(e.detail.state); }
      // @TODO: Handle takeback offers?
    });

    browser.runtime.onMessage.addListener((request)=> {
      // Restart dmitlichess when options are saved
      if (request.message === 'optionsSaved' ) {
        // Stop to prevent sounds being repeated multiple times
        this.stop();

        // Apply saved dmitlichess options and restart if enabled
        browser.storage.sync.get(Utils.defaults).then((items)=> {
          this[items.enabled ? 'start' : 'stop']();
        });
      }
    });
  }

  init() {
    this.emitters = {
      moves: new MoveEmitter(this.movesElement, this.movesElement),
      gameStates: new GameStateEmitter(this.movesElement, this.movesElement)
    };

    browser.storage.sync.get(Utils.defaults).then((items)=> {
      this.options = items;

      this.audioQueue = new AudioQueue(this.options, this.movesElement);

      this.addListeners(this.movesElement);

      // Start if the extension is enabled and the game is not over
      this[this.options.enabled && !Utils.isGameOver() ? 'start' : 'stop']();
    });
  }

  gameOver(state = 'resign') {
    this.stop();

    this.audioQueue.clear(true);
    this.audioQueue.push(state);
    this.audioQueue.push('signoff');
  }

  resetMiscInterval() {
    if (!this.intervals.misc) { return; }

    clearInterval(this.intervals.misc);

    if (this.options.enabled) {
      this.intervals.misc = setInterval(()=> { this.audioQueue.push('misc'); }, this.options.miscInterval);
    }
  }

  start() {
    this.emitters.moves.init();
    this.emitters.gameStates.init();

    // Play random sound bits
    this.intervals.misc = setInterval(()=> { this.audioQueue.push('misc'); }, this.options.miscInterval);
    this.intervals.fill = setInterval(()=> { this.audioQueue.push('fill'); }, this.options.fillInterval);
    this.intervals.long = setTimeout(()=> { this.audioQueue.push('long'); }, (Math.floor(Math.random() * this.options.longTimeout) + 1) * 1000);

    this.options.enabled = true;
  }

  stop() {
    this.emitters.moves.disconnect();
    this.emitters.gameStates.disconnect();

    if (this.intervals.misc) { clearInterval(this.intervals.misc); }
    if (this.intervals.fill) { clearInterval(this.intervals.fill); }
    if (this.intervals.long) { clearTimeout(this.intervals.long); }

    this.options.enabled = false;
  }
}



// Wait for the move list element to be created
// Then initialize the extension
let mutationsCount = 0;
const observer = new MutationObserver((mutations, observerInstance) => {
  const movesElement = document.querySelector('#lichess .moves');

  // Disconnect after 10 mutations
  // the move notation should one of the first element created a lichess page is loaded
  // @TODO figure a more efficient way to disable the extension on pages without moves notation
  mutationsCount++;
  if (mutationsCount > 10) { observerInstance.disconnect(); }

  if (!movesElement) { return; }

  window.dmitli = new Dmitlichess(movesElement);
  window.dmitli.init();

  observerInstance.disconnect();
});

observer.observe(document, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
});
