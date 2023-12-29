# Halls of Mandos -- Coding Journal

## 28 Dec 2023

### Basic Dungeon Generation

I got basic map generation working. 
We create 3--10 rooms of random size.
I found that due to the characters on the terminal being more pixels tall than wide,
rooms look better if they are generally wider than they are tall.

Rooms are connected with corridors simply by connecting rooms
in the order which they were generated, digging through other rooms
that may be in the middle. The result is that we have a satisfyingly complex
dungeon level.

```sh
 #############     ############
 #...........#     #..........#                              ########
 #...........#     #..........################################......#
 #...........#######................................................#
 #...........#.....#..........####################.........###......#
 #...........#.............................................# #......#
 #...........#.......#############.........................# #......#
 #...........######...####       #..........######.........# #......#
 #.......................#       #..#########    ###############..###
 #############...........#########.#########################.....##
             #...................................................#
             #...........###################################.....#
             #.............#######..........#              #######
             #############..................#
                         #########..........#
                                 ############
```

My intent is that a simple one-tile entrace to a room will have a door,
but wider entraces will be open, resulting in a combination of traditional
rooms and corridors and multi-room caverns.

### Workspaces

I realize that we want to divide the project into client, server, and common crates.

Workspaces is the tool for the job:

https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html

### Entity Component Systems

For learning modern game machinics, I'm following this tutorial on building a rouguelike in Rust using ECS:

https://bfnightly.bracketproductions.com/chapter_2.html

