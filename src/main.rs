
const MAP_WIDTH: usize = 72;
const MAP_HEIGHT: usize = 17;

#[derive(Copy, Clone, PartialEq)]
enum TileType {
  Wall,
  Floor,
}

struct Tile {
  tile_type: TileType,
}

struct Rect {
  l: i32,
  t: i32,
  w: i32,
  h: i32,
}

use rand::Rng;

impl Rect {
  fn new(l: i32, t: i32, w: i32, h: i32) -> Self {
    Rect { l, t, w, h }
  }

  fn random(min_width: i32, max_width: i32,
            min_height: i32, max_height: i32,
            rng: &mut impl Rng) -> Self {
    let w = rng.gen_range(min_width..max_width);
    let h = rng.gen_range(min_height..max_height);
    let l = rng.gen_range(1..MAP_WIDTH as i32 - w - 1);
    let t = rng.gen_range(1..MAP_HEIGHT as i32 - h - 1);
    Rect { l, t, w, h }
  }

  fn center(&self) -> (i32, i32) {
    let cx = self.l + self.w / 2;
    let cy = self.t + self.h / 2;
    (cx, cy)
  }

  fn intersect(&self, other: &Rect) -> bool {
    self.l <= other.l + other.w &&
    self.l + self.w >= other.l &&
    self.t <= other.t + other.h &&
    self.t + self.h >= other.t
  }
}

struct Room {
  rect: Rect,
}

struct Map {
  tiles: [Tile; MAP_WIDTH * MAP_HEIGHT],
  rooms: Vec<Room>,
}

impl Map {
  fn new() -> Self {
    Map {
      tiles : std::array::from_fn(|_i| {
        Tile { tile_type: TileType::Wall }
      }),
      rooms: Vec::new(),
    }
  }

  fn generate(&mut self, rng: &mut impl Rng) {
    let room_count = rng.gen_range(3..10);
    let mut rooms = Vec::new();
    for _ in 0..100 {
      let room = Rect::random(5, 13, 3, 9, rng);
      let mut ok = true;
      for other in &rooms {
        if room.intersect(other) {
          ok = false;
          break;
        }
      }
      if ok {
        self.create_room(&room);
        rooms.push(room);
      }
      if rooms.len() == room_count {
        break;
      }
    }

    // connect rooms with corridors
    for i in 0..rooms.len() - 1 {
      let (cx1, cy1) = rooms[i].center();
      let (cx2, cy2) = rooms[i + 1].center();
      let (mut x, mut y) = (cx1, cy1);
      while !(x == cx2 && y == cy2) {
        if x != cx2 && y != cy2 {
          if rng.gen_bool(0.5) {
            x += if x < cx2 { 1 } else { -1 };
          } else {
            y += if y < cy2 { 1 } else { -1 };
          }
        } else if x != cx2 {
          x += if x < cx2 { 1 } else { -1 };
        } else {
          y += if y < cy2 { 1 } else { -1 };
        }
        let idx = y as usize * MAP_WIDTH + x as usize;
        self.tiles[idx].tile_type = TileType::Floor;
      }
    }

  }

  fn create_room(&mut self, room: &Rect) {
    for y in room.t..room.t + room.h {
      for x in room.l..room.l + room.w {
        let idx = y as usize * MAP_WIDTH + x as usize;
        self.tiles[idx].tile_type = TileType::Floor;
      }
    }
  }

  fn print(&self) {
    for y in 0..MAP_HEIGHT {
      for x in 0..MAP_WIDTH {
        let tile = &self.tiles[y * MAP_WIDTH + x];
        if tile.tile_type == TileType::Floor {
          print!(".");
        } else {
          // check if any neighboring tile is a floor
          let mut visibile = false;
          for dy in -1..=1 {
            for dx in -1..=1 {
              let xx = x as i32 + dx;
              let yy = y as i32 + dy;
              if xx >= 0 && xx < MAP_WIDTH as i32 &&
                 yy >= 0 && yy < MAP_HEIGHT as i32 {
                let idx = yy as usize * MAP_WIDTH + xx as usize;
                if self.tiles[idx].tile_type == TileType::Floor {
                  visibile = true;
                }
              }
            }
          }
          if visibile {
            print!("#");
          } else {
            print!(" ");
          }
        }
      }
      print!("\n");
    }
  }
}

fn main() {
  let mut map = Map::new();
  let mut rng = rand::thread_rng();
  map.generate(&mut rng);
  map.print();
}