# Third-party asset release gate

| Asset | Local path | Source | Status required before public release |
| --- | --- | --- | --- |
| Character code foundation | `src/animation/CharacterController.js`, `src/animation/WalkController.js` | [AvatarCastingAbilitiesThreeJS](https://github.com/achrefelouafi/AvatarCastingAbilitiesThreeJS), MIT source license | Source attribution recorded. |
| Character FBX | `public/models/Standing Idle.fbx` | Bundled by the upstream repository | Upstream README says the binary retains its original license. Its public redistribution right has not been independently verified here. Replace it with an original/licensed character or obtain written redistribution confirmation before publishing. |
| Environment HDR | `public/hdri/spruit_sunrise.hdr` | Bundled by the upstream repository | Upstream README says the binary retains its original license. Its public redistribution right has not been independently verified here. Replace it with an original/licensed HDR or obtain written redistribution confirmation before publishing. |

The application never downloads these assets from GitHub at runtime. They are local development files only until the two binary provenance checks above are closed.
