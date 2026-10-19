# Demo video script (under 3 minutes)

Record on a real Fire TV or on the Fire TV / Android TV emulator (the hackathon rules require an actual Fire TV device or the Fire TV/Vega simulator in the video). A real Fire TV shows the 3D buddies; the emulator shows the flat buddies. Show the remote, or an on-screen key overlay, so judges see it is driven by the remote. Use only the app's own audio and the voiceover; no other music.

Lead with the best material: judges are not required to watch past 3 minutes.

| Time | Show | Say (voiceover) |
|---|---|---|
| 0:00-0:15 | Launch the app. The opening scene: four buddies with their names, then the home screen. | "This is Zora Play, a buddy for children aged three to eight, on Fire TV. Everything is driven by the remote, and it works offline." |
| 0:15-0:40 | My buddy: pick Mimi, hear her introduce herself in her own voice. Switch back to Zora. | "Four buddies, each with its own look, name and voice." |
| 0:40-1:05 | Dance: Wiggle, press Faster twice (flames light, animation and music speed up), Stop freezes, Again. | "Faster really changes the animation and the music tempo. Stop is instant." |
| 1:05-1:30 | Talk: "Can you count to five with me?", then "Tell me a joke" (question, pause, answer, laugh), then "I'm sad" (buddy turns supportive and offers a breath). | "Talk uses fixed, reviewed, voiced lines. One sound at a time, never overlapping. It responds kindly to feelings." |
| 1:30-1:50 | Play: Animal Sounds (real recording, pick the animal) and Shape Match; a shiny scale lands on the shelf. | "Games are short and forgiving, and finishing earns a shiny scale." |
| 1:50-2:05 | Sing: one song with karaoke highlighting. Band: tap a few instruments. | "Original songs with word highlighting, and a band where children make their own music." |
| 2:05-2:40 | **AWS Builder.** Show a terminal: `bedrock-generate` writes pending lines, `bedrock-check` shows the guardrail blocking an unsafe test line and passing a safe one, `review-lines` where a person approves. Then show the CloudWatch invocation log. Cut back to the TV: the buddy speaks an approved line. | "The app never calls AWS. At build time, Amazon Bedrock writes new lines, a Bedrock Guardrail checks every one, and a person approves each line. CloudWatch logs every call. Forty-five lines passed the guardrail; we approved twenty-eight." |
| 2:40-2:55 | Settings (hold OK for 3 seconds): the privacy panel. | "No account, no ads, no analytics, nothing saved. The buddy only says reviewed lines." |
| 2:55-3:00 | Back to the buddy waving. | "Zora Play: talk, play, dance, learn." |

Only show features that worked on the device you recorded on. Redact the AWS account id before showing the CloudWatch log. Rehearse the AWS terminal part with the commands in `docs/aws-bedrock.md`, and record it on a short pre-generated run so no live call can fail on camera.
