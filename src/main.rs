
const MAP_WIDTH: usize = 72;
const MAP_HEIGHT: usize = 17;

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

  fn random(min_size: i32, max_size: i32, rng: &mut impl Rng) -> Self {
    let w = rng.gen_range(min_size..max_size);
    let h = rng.gen_range(min_size..max_size);
    let l = rng.gen_range(0..MAP_WIDTH as i32 - w);
    let t = rng.gen_range(0..MAP_HEIGHT as i32 - h);
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
    // loop up to 100 times,
    // trying to create room_count rooms.
    for _ in 0..100 {
      let room = Rect::random(5, 10, rng);
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
        match tile.tile_type {
          TileType::Floor => print!("."),
          TileType::Wall => print!("#"),
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