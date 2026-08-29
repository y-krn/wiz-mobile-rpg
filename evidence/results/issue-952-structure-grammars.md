# Issue #952: structure grammar evidence

The samples below use the same 24x24 shallow-floor conditions and fixed seed
per type. `#` is an uncarved cell, `.` is a passage, `U`/`D` are stairs, `e` is
an event, and `^` is a trap. The before maps are a pre-#952 shared-maze
snapshot (`8fb5f71`); the after maps use the type-specific skeleton-first generator.

## Before: shared maze grammar

| type | cycles | alternative path | junctions | corridor ratio | open-area cells |
| --- | ---: | ---: | ---: | ---: | ---: |
| corridor | 10 | 0.539 | 32 | 0.462 | 15 |
| loop | 11 | 0.318 | 31 | 0.673 | 19 |
| hub | 10 | 0.510 | 29 | 0.484 | 15 |
| openArea | 9 | 0.597 | 31 | 0.408 | 15 |

```text
corridor                 loop                      hub                       openArea
                          
 ........e ...........     ....^D......^.........     ............... .....     .....e               e 
 .         . .       .     .   .   .         . .     .     .   ..  . .   .     ..... e...U.........e.
 ......U...... ...^..^.     . e ..... ....... . .     . ... . ..... . ..e .     .  .               ^
 .             .      D     . .   ... .   . . . .     . . . . . . . .     .     . e .................
 . ............. ....e      . ..e ... . ..... . .     . . D . . . . .......     . .                 .
 . .       ...   .    e     . .  e. . . .   . . .     . .   ^ . . .       .     ^ ................. .
 . e ....... . ^.......     . . e . . . . . ..^ .     ... ... e . ..^...e .     .           . .   ^ .
 .   .     . . .     .      . . . . ^ . . . .   .     .   .     .         .     . .......^. . . e.. .
 . ... e.... . ......^      . . . . . . . . . e..     . ... ..... ........e.     . .       . . .     .
 . .  e      .     ...      . . . . . . . . .   .     ^ .   .     .        e     . . e.... . . ........
 . . .................      . . . . . . . e ... .     . . e.. ..... ....^ e      . .     . . .        D
 . . .     .         .      . . ^ . . . .  e  . .     . .   . .     . . . .     . ...^. . ^ . e......
 . . . e.. . ......e .      . . . . . . . . . . .     . ... ..^ e.... . . .     .     . . . .     . .
 . . .   . . .       .      . . . . . . . .  . . .     .   .   .       . . .     ....e . . . ..... ...
 . ....... . . ........     . . . . ..... ^ . . ..     ... ... ......... . .     .     . . .e    . . .
 . .  e    . . .      e     . . . .  e  . . . . ..     . .   . ...       . .     ......... . ... . . .
 . . e ..... . . .....      . . . .     . . . .   .     ... ... .^......... .     .  e    . . . ^ ... .
 . . . .     . . .   .      ..U ............. e..     . .   . . .       . . .     . e e e . . . . ... .
 .....^. ..........^..      .                       e . . . . . . . . .   .     . . . . . . . . ... .
                          
```

## After: type-specific skeletons

| type | cycles | alternative path | junctions | corridor ratio | open-area cells | signature |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| corridor | 5.44 | 0.420 | 29.33 | 0.501 | 13.75 | long backbone + few bypasses |
| loop | 11.60 | 0.653 | 36.75 | 0.328 | 16.88 | rectangular ring + inner loops |
| hub | 54.00 | 0.795 | 81.50 | 0.243 | 35.50 | 5x5 hub + spokes |
| openArea | 50.92 | 0.701 | 78.31 | 0.347 | 68.31 | 9x7 plaza + four exits |

```text
corridor                 loop                      hub                       openArea
  .   e .                  .           e    .                 .                 . e  .  .
  ^.e . .                  .           .    .                 . .  e    .        . .  ..e
  .  ....e              D.^....^............               .  .  .  e .         ..U.......
  .^...U                   .   . . .    .                    .  .  . .          . . .   ^
  .                       .  ...       .^e                 .e....  . . .       .e e   . e
  ......e                 e..  .^.       .                 . ..^.......         ..e      .   ..e
  .   .                   .  . ...     e^.                .   .    .   .       .  . e ........
  .   e                   .    .       ^                  .   .    .   .       .    .........
  . .                     .    .       .                  .   .  D .....       .    .         .
  . .                     .    . e    .                   e e e .....        .  . ................
  ....e                   .    .       .                  . ^ . .....        .    .............
  .                     .     ...          ...           .............^......   ..^^...........
  ....                   .     .          e..             . .    .....  . .  .  ^    ......
  ....^..                .     .            .             . e    .....  e e  .       .........
  ..e ..D       e e      .     .            ..e          .        . ^       .  .e e . . .   ...
  .   .  .  e e . ...    .     ..e e .      .             .        . e     e..  . .  . . .    
  . e .  .  . . ^..      ....................             .        .     e..^  .      ..e
  ...^............. e    .     .      U.  .^              ..e e  . .       .   .        .
 ^....................   .     .      .  ...              .   .  . .       ^   e        .
 e                       .                       .        ...............U....          .
                         .                       .        
```

The complete deterministic sample maps and metrics are reproduced by
`scratch/tests/unit/test_structure_grammars.js`. The test also verifies that
stairs remain reachable and that the hub/plaza anchors are present.

## Continuous B1F-B5F sample

For run seed `ISSUE-952-PLAY`, the generated sequence was:

| floor | type | critical path | walkable cells | cycles |
| --- | --- | ---: | ---: | ---: |
| B1F | loop | 29 | 171 | 15 |
| B2F | corridor | 28 | 134 | 6 |
| B3F | loop | 25 | 175 | 15 |
| B4F | corridor | 27 | 133 | 6 |
| B5F | openArea | 30 | 160 | 49 |

This gives the run different route decisions floor-to-floor: ring traversal and
side choice on Loop, retreat distance on Corridor, and exit selection from the
B5F plaza. `generateRunFloor` validation and the full reachability loop keep
stairs, events, traps, one-way passages, and secret doors completable.
