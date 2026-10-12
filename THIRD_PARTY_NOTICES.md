# Third-party asset release gate

| Asset | Local path | Source | Status required before public release |
| --- | --- | --- | --- |
| Character code foundation | `src/animation/CharacterController.js`, `src/animation/WalkController.js` | [AvatarCastingAbilitiesThreeJS](https://github.com/achrefelouafi/AvatarCastingAbilitiesThreeJS), MIT source license | Source attribution recorded. |
| Character FBX | `public/models/Standing Idle.fbx` | Bundled by the upstream repository | Upstream README says the binary retains its original license. Its public redistribution right has not been independently verified here. Replace it with an original/licensed character or obtain written redistribution confirmation before publishing. |
| Environment HDR | `public/hdri/spruit_sunrise.hdr` | Bundled by the upstream repository | Upstream README says the binary retains its original license. Its public redistribution right has not been independently verified here. Replace it with an original/licensed HDR or obtain written redistribution confirmation before publishing. |
| Character motion pack | `public/models/caster-motion.glb` | Generated with fal.ai `meshy/rigging/multi-animation` from the bundled character mesh; clips are Meshy animation-library actions | Generated under the project's own fal/Meshy account — review the current Meshy/fal output license terms before public release. Derives from the bundled character mesh, so the same provenance caveat as the FBX applies. |
| World-card preview loops | `public/media/previews/*.mp4` | Generated with fal.ai `minimax/h3-max-turbo/image-to-video` from the repo's own world prior stills and the generated ritual still | Generated under the project's own fal account — review the current fal/MiniMax output license terms before public release. Derives from each world's prior image. |
| Ritual Stage card still | `public/media/previews/ritual-stage.png` | Generated with fal.ai `openai/gpt-image-2.5/sunburst/text-to-image` | Generated under the project's own fal account — review the current fal/OpenAI image output terms before public release. |

The application never downloads these assets from GitHub at runtime. They are local development files only until the two binary provenance checks above are closed.
