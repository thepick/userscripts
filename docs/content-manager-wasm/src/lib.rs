use std::cell::RefCell;
use std::collections::{BTreeMap, VecDeque};

#[derive(Default)]
struct Node {
    edges: BTreeMap<u16, usize>,
    fail: usize,
    suffix: usize,
    terminal: bool,
    variants: Vec<u32>,
}

struct Matcher {
    nodes: Vec<Node>,
    keys: Vec<usize>,
    seen: Vec<bool>,
    touched: Vec<usize>,
    variant_hits: Vec<u32>,
}

impl Matcher {
    fn build(words: &[u32]) -> Option<Self> {
        let mut input = words.iter().copied();
        let count = input.next()? as usize;
        if count > input.len() {
            return None;
        }
        let mut matcher = Self {
            nodes: vec![Node::default()],
            keys: Vec::with_capacity(count),
            seen: Vec::new(),
            touched: Vec::new(),
            variant_hits: Vec::new(),
        };
        for rule in 0..count {
            let key_length = input.next()?;
            if key_length == 0 {
                matcher.keys.push(0);
                continue;
            }
            let key = matcher.insert(&mut input, key_length)?;
            matcher.keys.push(key);
            let variants = input.next()?;
            if !(1..=2).contains(&variants) {
                return None;
            }
            for _ in 0..variants {
                let variant_length = input.next()?;
                let variant = matcher.insert(&mut input, variant_length)?;
                matcher.nodes[variant].variants.push(rule as u32);
            }
        }
        if input.next().is_some() {
            return None;
        }
        matcher.link_suffixes();
        matcher.seen.resize(matcher.nodes.len(), false);
        Some(matcher)
    }

    fn insert(&mut self, input: &mut impl Iterator<Item = u32>, length: u32) -> Option<usize> {
        if length == 0 {
            return None;
        }
        let mut state = 0;
        for _ in 0..length {
            let unit = u16::try_from(input.next()?).ok()?;
            state = match self.nodes[state].edges.get(&unit) {
                Some(&next) => next,
                None => {
                    let next = self.nodes.len();
                    self.nodes.push(Node::default());
                    self.nodes[state].edges.insert(unit, next);
                    next
                }
            };
        }
        self.nodes[state].terminal = true;
        Some(state)
    }

    fn link_suffixes(&mut self) {
        let mut queue: VecDeque<usize> = self.nodes[0].edges.values().copied().collect();
        while let Some(state) = queue.pop_front() {
            // The parent and its failure link have already been visited in breadth-first order.
            let children: Vec<_> = self.nodes[state]
                .edges
                .iter()
                .map(|(&c, &n)| (c, n))
                .collect();
            for (unit, child) in children {
                let fail = self.transition(self.nodes[state].fail, unit);
                self.nodes[child].fail = fail;
                self.nodes[child].suffix = if self.nodes[fail].terminal {
                    fail
                } else {
                    self.nodes[fail].suffix
                };
                queue.push_back(child);
            }
        }
    }

    fn transition(&self, mut state: usize, unit: u16) -> usize {
        loop {
            if let Some(&next) = self.nodes[state].edges.get(&unit) {
                return next;
            }
            if state == 0 {
                return 0;
            }
            state = self.nodes[state].fail;
        }
    }

    fn scan(&mut self, text: &[u32]) {
        let mut state = 0;
        for &unit in text {
            // The bridge writes each unit using String.charCodeAt(). No Unicode transcoding.
            state = self.transition(state, unit as u16);
            let mut hit = if self.nodes[state].terminal {
                state
            } else {
                self.nodes[state].suffix
            };
            while hit != 0 && !self.seen[hit] {
                self.seen[hit] = true;
                self.touched.push(hit);
                self.variant_hits
                    .extend_from_slice(&self.nodes[hit].variants);
                hit = self.nodes[hit].suffix;
            }
        }
    }

    fn candidates(&mut self, text: &[u32], phrases: &[u32], result: &mut Vec<u32>) {
        self.scan(text);
        self.scan(phrases);
        result.clear();
        result.extend(
            self.variant_hits
                .drain(..)
                .filter(|&rule| self.seen[self.keys[rule as usize]]),
        );
        result.sort_unstable();
        result.dedup();
        for hit in self.touched.drain(..) {
            self.seen[hit] = false;
        }
    }
}

#[derive(Default)]
struct Bridge {
    input: Vec<u32>,
    result: Vec<u32>,
    matcher: Option<Matcher>,
}

thread_local! {
    static BRIDGE: RefCell<Bridge> = RefCell::new(Bridge::default());
}

// The host only writes the initialized words returned by reserve_input, before calling build/find.
#[no_mangle]
pub extern "C" fn reserve_input(length: usize) -> *mut u32 {
    BRIDGE.with(|state| {
        let mut state = state.borrow_mut();
        if length > state.input.len() {
            state.input.resize(length, 0);
        }
        state.input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn build(length: usize) -> i32 {
    BRIDGE.with(|state| {
        let mut state = state.borrow_mut();
        state.matcher = state.input.get(..length).and_then(Matcher::build);
        i32::from(state.matcher.is_some())
    })
}

#[no_mangle]
pub extern "C" fn find(text_length: usize, phrase_length: usize) -> i32 {
    BRIDGE.with(|state| {
        let mut state = state.borrow_mut();
        let Bridge {
            input,
            result,
            matcher,
        } = &mut *state;
        let Some(length) = text_length.checked_add(phrase_length) else {
            return -1;
        };
        let (Some(matcher), Some(words)) = (matcher.as_mut(), input.get(..length)) else {
            return -1;
        };
        let (text, phrases) = words.split_at(text_length);
        matcher.candidates(text, phrases, result);
        result.len() as i32
    })
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const u32 {
    BRIDGE.with(|state| state.borrow().result.as_ptr())
}
