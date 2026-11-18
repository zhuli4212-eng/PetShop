"""Render the original shop loop and interaction sounds. Requires FFmpeg for MP3."""
from array import array
from math import exp, pi, sin
from pathlib import Path
from tempfile import TemporaryDirectory
import random
import subprocess
import wave

RATE = 44100
BEAT = 60 / 94
ROOT = Path(__file__).resolve().parents[1] / "assets" / "resources" / "audio"

# Sixteen measures in G major. Each note gives its beat, MIDI pitch, length and strength.
MELODY = (
    ((0, 71, .8, .82), (1, 74, .55, .76), (2, 69, .65, .74), (3, 67, 1, .7)),
    ((.5, 69, .65, .69), (1.5, 71, .75, .74), (2.5, 74, 1.1, .78)),
    ((0, 76, .7, .78), (1, 74, .65, .75), (2, 71, .85, .77), (3.25, 69, .65, .6)),
    ((0, 67, 1, .83), (1.5, 69, .55, .65), (2.5, 71, 1.15, .7)),
    ((0, 72, .8, .78), (1, 76, .75, .86), (2.5, 74, .6, .75), (3.25, 72, .6, .68)),
    ((0, 71, .65, .73), (1, 67, .6, .72), (2, 69, .75, .7), (3.25, 71, .55, .69)),
    ((0, 69, .7, .75), (1.5, 72, .7, .78), (2.5, 71, .8, .69)),
    ((0, 69, 1.15, .72), (2, 66, .65, .65), (3, 67, .85, .68)),
    ((0, 71, .75, .81), (.75, 74, .65, .74), (1.75, 79, .9, .8), (3, 76, .65, .69)),
    ((0, 74, .9, .76), (1.5, 71, .65, .7), (2.5, 69, 1.1, .66)),
    ((0, 71, .6, .75), (1, 76, .72, .76), (2.25, 78, .65, .72), (3, 76, .7, .67)),
    ((0, 72, .75, .75), (1, 67, 1, .73), (2.5, 69, .7, .63)),
    ((0, 72, .7, .69), (.75, 74, .64, .72), (1.5, 76, .7, .8), (2.75, 79, .92, .79)),
    ((0, 76, .65, .75), (1.25, 74, .7, .72), (2.5, 71, .82, .72)),
    ((0, 69, .67, .72), (1.25, 66, .62, .67), (2.5, 69, .74, .73), (3.38, 71, .45, .65)),
    ((0, 67, 1.25, .81), (1.75, 71, .74, .68), (2.75, 74, 1.22, .66)),
)
HARMONY = (
    (43, 55, 59, 62), (42, 54, 57, 62), (40, 55, 59, 64), (48, 55, 60, 64),
    (48, 55, 60, 64), (47, 55, 59, 62), (45, 57, 60, 64), (50, 54, 57, 62),
    (43, 55, 59, 62), (42, 54, 57, 62), (40, 55, 59, 64), (48, 55, 60, 64),
    (45, 57, 60, 64), (48, 55, 60, 64), (50, 54, 57, 62), (43, 55, 59, 62),
)
PARTIALS = {
    "wood": ((1, .76, 4), (2, .18, 10), (3.98, .06, 23)),
    "pluck": ((1, .68, 3), (2, .20, 7), (3, .09, 12), (4, .03, 16)),
    "bass": ((1, .91, 3), (2, .09, 8)),
    "chime": ((1, .77, 4), (2, .17, 11), (3.02, .06, 15)),
    "knock": ((1, .58, 34), (1.61, .29, 43), (3.28, .13, 87)),
}


def silent(seconds):
    return array("f", [0]) * round(seconds * RATE)


def add_note(track, start, pitch, seconds, strength, voice, loop=False):
    index = round(start * RATE)
    count = round(seconds * RATE)
    omega = 2 * pi * 440 * 2 ** ((pitch - 69) / 12) / RATE
    partials = [(omega * freq, amp, exp(-decay / RATE)) for freq, amp, decay in PARTIALS[voice]]
    attack = round(RATE * (.012 if voice == "bass" else .006))
    release = max(1, min(round(.065 * RATE), count // 3))
    weights = [p[1] for p in partials]
    for sample in range(count):
        i = index + sample
        if loop:
            i %= len(track)
        elif i >= len(track):
            break
        envelope = min(1, sample / attack, (count - sample - 1) / release)
        value = 0
        for band, (frequency, _, attenuation) in enumerate(partials):
            value += sin(frequency * sample) * weights[band]
            weights[band] *= attenuation
        track[i] += strength * envelope * value


def add_echo(track, amount, loop):
    dry = track[:]
    for delay, weight in ((.041, .59), (.074, .41), (.127, .28), (.193, .16)):
        samples = round(RATE * delay)
        for i in range(0 if loop else samples, len(track)):
            track[i] += amount * weight * dry[i - samples]


def music():
    rng = random.Random(731)
    track = silent(64 * BEAT)
    for bar, (harmony, melody) in enumerate(zip(HARMONY, MELODY)):
        start = 4 * bar * BEAT
        bass, root, third, fifth = harmony
        for pos, pitch, length, weight in melody:
            add_note(track, start + pos * BEAT, pitch, length * BEAT, weight * .37, "wood", True)
        add_note(track, start, bass, 1.57 * BEAT, .22, "bass", True)
        add_note(track, start + 2.42 * BEAT, bass + 12, .98 * BEAT, .12, "bass", True)
        pattern = ((.5, root, .16), (1.48, fifth, .12), (2.17, third, .14), (3.33, fifth, .11))
        for pos, pitch, weight in pattern:
            add_note(track, start + (pos + rng.uniform(-.014, .014)) * BEAT, pitch,
                     .88 * BEAT, weight, "pluck", True)
    add_echo(track, .14, True)
    return track


EFFECTS = {
    "tap": (.092, ((0, 48, .070, .79, "knock"), (.020, 56, .052, .24, "knock"))),
    "confirm": (.33, ((0, 62, .18, .72, "wood"), (.085, 67, .20, .56, "wood"))),
    "feed": (.34, ((0, 43, .13, .52, "knock"), (.09, 58, .15, .54, "pluck"),
                  (.157, 65, .115, .33, "wood"))),
    "growth": (.68, ((0, 67, .27, .6, "pluck"), (.081, 71, .31, .66, "wood"),
                    (.181, 74, .32, .60, "wood"), (.284, 79, .31, .52, "chime"))),
    "hatch": (.77, ((0, 74, .25, .72, "wood"), (.13, 79, .23, .69, "wood"),
                   (.25, 81, .24, .54, "wood"), (.375, 79, .34, .52, "pluck"))),
    "coins": (.39, ((0, 83, .15, .79, "chime"), (.075, 86, .19, .64, "chime"),
                   (.134, 91, .18, .42, "chime"))),
    "reward": (.81, ((0, 67, .32, .59, "wood"), (.096, 71, .35, .54, "wood"),
                     (.193, 74, .35, .55, "pluck"), (.318, 79, .38, .61, "chime"),
                     (.318, 71, .36, .23, "pluck"))),
}


def write_wave(path, track, peak):
    gain = peak / max(map(abs, track))
    samples = array("h", (round(value * gain * 32767) for value in track))
    import sys
    if sys.byteorder == "big":
        samples.byteswap()
    with wave.open(str(path), "wb") as out:
        out.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        out.writeframes(samples.tobytes())


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, (length, notes) in EFFECTS.items():
        track = silent(length)
        for note in notes:
            add_note(track, *note)
        if name != "tap":
            add_echo(track, .11, False)
        write_wave(ROOT / (name + ".wav"), track, .72)
    with TemporaryDirectory() as tmp:
        wav = Path(tmp) / "shop-loop.wav"
        write_wave(wav, music(), .76)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "libmp3lame",
                        "-b:a", "80k", str(ROOT / "wheatlight.mp3")], check=True)


if __name__ == "__main__":
    main()
